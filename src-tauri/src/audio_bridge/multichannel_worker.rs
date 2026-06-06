use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::audio_bridge::multichannel_types::{
    MultichannelBridgeConfig, MultichannelBridgeStatus, MultichannelSourceStatus,
};
use crate::audio_bridge::runtime_config::{channel_gain_linear, runtime_channel_snapshot};
use crate::audio_bridge::types::BridgeState;

pub struct MultichannelWorkerArgs {
    pub config: MultichannelBridgeConfig,
    pub stop_flag: Arc<AtomicBool>,
    pub done_flag: Arc<AtomicBool>,
    pub shared_status: Arc<Mutex<MultichannelBridgeStatus>>,
}

pub fn run_multichannel_bridge_worker(args: MultichannelWorkerArgs) {
    #[cfg(windows)]
    {
        run_multichannel_bridge_worker_windows(args);
        return;
    }

    #[cfg(not(windows))]
    {
        set_error(
            &args.shared_status,
            "Multi-channel bridge requires Windows.".to_string(),
        );
        args.done_flag.store(true, Ordering::Release);
    }
}

fn set_error(shared: &Arc<Mutex<MultichannelBridgeStatus>>, message: String) {
    if let Ok(mut status) = shared.lock() {
        status.state = BridgeState::Error;
        status.running = false;
        status.last_error = Some(message);
        status.updated_at = chrono::Utc::now().to_rfc3339();
    }
}

#[cfg(windows)]
struct SourceStream {
    channel_id: &'static str,
    endpoint_id: String,
    endpoint_name: String,
    client: windows::Win32::Media::Audio::IAudioClient,
    capture: windows::Win32::Media::Audio::IAudioCaptureClient,
    channels: usize,
    rate: u32,
    bits_per_sample: u16,
    is_float: bool,
    input_format: String,
    resampler: Option<crate::audio_bridge::resampler::LinearResampler>,
    buffer: Vec<f32>,
    read_index: usize,
    staging: Vec<f32>,
    packets: u64,
    frames: u64,
    bytes: u64,
    silence_count: u64,
    discontinuity_count: u64,
    peak: f32,
    sum_sq: f64,
    sample_count: u64,
    dropped_frames: u64,
}

#[cfg(windows)]
struct MonitorStream {
    client: windows::Win32::Media::Audio::IAudioClient,
    render: windows::Win32::Media::Audio::IAudioRenderClient,
    buffer_size: u32,
    out_channels: usize,
    out_rate: u32,
    bits_per_sample: u16,
    is_float: bool,
    output_name: String,
    output_id: String,
    output_format: String,
}

#[cfg(windows)]
const AUDCLNT_STREAMFLAGS_LOOPBACK: u32 = 0x00020000;
#[cfg(windows)]
const AUDCLNT_BUFFERFLAGS_SILENT: u32 = 0x00000002;
#[cfg(windows)]
const AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY: u32 = 0x00000001;
#[cfg(windows)]
const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
#[cfg(windows)]
const WAVE_FORMAT_PCM: u16 = 1;
#[cfg(windows)]
const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;
#[cfg(windows)]
const SUBTYPE_IEEE_FLOAT: windows::core::GUID = windows::core::GUID::from_values(
    0x00000003,
    0x0000,
    0x0010,
    [0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71],
);
#[cfg(windows)]
const BUFFER_100NS: i64 = 1_000_000;
#[cfg(windows)]
const TARGET_BUFFER_MS: u64 = 50;
#[cfg(windows)]
const MAX_BUFFER_MS: u64 = 200;

#[cfg(windows)]
fn run_multichannel_bridge_worker_windows(args: MultichannelWorkerArgs) {
    use windows::core::HRESULT;
    use windows::Win32::Media::Audio::{IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106u32 as i32);

    let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let should_uninit = if hr.is_ok() {
        true
    } else if hr == RPC_E_CHANGED_MODE {
        false
    } else {
        set_error(&args.shared_status, format!("COM init failed: {hr}"));
        args.done_flag.store(true, Ordering::Release);
        return;
    };

    let enumerator: IMMDeviceEnumerator =
        match unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) } {
            Ok(value) => value,
            Err(error) => {
                set_error(
                    &args.shared_status,
                    format!("IMMDeviceEnumerator failed: {error}"),
                );
                args.done_flag.store(true, Ordering::Release);
                if should_uninit {
                    unsafe { CoUninitialize() };
                }
                return;
            }
        };

    let monitor_device = match open_by_id(&enumerator, &args.config.output_endpoint_id) {
        Some(device) => device,
        None => {
            set_error(
                &args.shared_status,
                "Selected physical output endpoint is unavailable.".to_string(),
            );
            args.done_flag.store(true, Ordering::Release);
            if should_uninit {
                unsafe { CoUninitialize() };
            }
            return;
        }
    };

    let monitor = match open_monitor_render(&monitor_device) {
        Ok(value) => value,
        Err(error) => {
            set_error(&args.shared_status, error);
            args.done_flag.store(true, Ordering::Release);
            if should_uninit {
                unsafe { CoUninitialize() };
            }
            return;
        }
    };

    let mut sources = Vec::new();
    for (channel_id, endpoint_id) in [
        ("general", args.config.general_endpoint_id.clone()),
        ("music", args.config.music_endpoint_id.clone()),
        ("game", args.config.game_endpoint_id.clone()),
        ("browser", args.config.browser_endpoint_id.clone()),
    ] {
        let Some(device) = open_by_id(&enumerator, &endpoint_id) else {
            set_error(
                &args.shared_status,
                format!("Required {channel_id} endpoint is unavailable."),
            );
            args.done_flag.store(true, Ordering::Release);
            if should_uninit {
                unsafe { CoUninitialize() };
            }
            return;
        };

        let endpoint_name = get_friendly_name(&device);
        match open_loopback_capture(&device) {
            Ok((client, capture, channels, rate, bits_per_sample, is_float)) => {
                let input_format = format!(
                    "{}Hz {}ch {}",
                    rate,
                    channels,
                    if is_float { "float32" } else { "pcm" }
                );
                let resampler = if rate != monitor.out_rate {
                    Some(crate::audio_bridge::resampler::LinearResampler::new(
                        rate,
                        monitor.out_rate,
                        channels,
                    ))
                } else {
                    None
                };
                sources.push(SourceStream {
                    channel_id,
                    endpoint_id,
                    endpoint_name,
                    client,
                    capture,
                    channels,
                    rate,
                    bits_per_sample,
                    is_float,
                    input_format,
                    resampler,
                    buffer: Vec::with_capacity(
                        (((MAX_BUFFER_MS as f64 / 1000.0) * monitor.out_rate as f64) as usize
                            * channels)
                            + 16384,
                    ),
                    read_index: 0,
                    staging: Vec::new(),
                    packets: 0,
                    frames: 0,
                    bytes: 0,
                    silence_count: 0,
                    discontinuity_count: 0,
                    peak: 0.0,
                    sum_sq: 0.0,
                    sample_count: 0,
                    dropped_frames: 0,
                });
            }
            Err(error) => {
                set_error(
                    &args.shared_status,
                    format!("Failed to open {channel_id} loopback: {error}"),
                );
                args.done_flag.store(true, Ordering::Release);
                if should_uninit {
                    unsafe { CoUninitialize() };
                }
                return;
            }
        }
    }

    let (default_render_id, default_render_name) = read_default_render(&enumerator);
    let physical_output_is_audapp =
        crate::audio::classify_audapp_endpoint(&monitor.output_name).is_audapp_endpoint;

    {
        let mut status = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
        status.monitor_output.output_id = Some(monitor.output_id.clone());
        status.monitor_output.output_name = Some(monitor.output_name.clone());
        status.monitor_output.output_format = Some(monitor.output_format.clone());
        status.monitor_output.default_render_id = default_render_id.clone();
        status.monitor_output.default_render_name = default_render_name.clone();
        status.monitor_output.is_physical_output_audapp = physical_output_is_audapp;
        status.monitor_output.output.initialize_ok = true;
        if physical_output_is_audapp {
            // Should be impossible after the physical-output resolver, but surface it
            // loudly rather than rendering silently into a virtual sink.
            status.last_error = Some(format!(
                "Bridge render output resolved to an Audapp endpoint ({}); refusing to treat it as a physical output.",
                monitor.output_name
            ));
        }
        for source in &sources {
            update_source_status(&mut status.sources, source, true, false);
        }
    }

    for source in &sources {
        if let Err(error) = unsafe { source.client.Start() } {
            set_error(
                &args.shared_status,
                format!("Failed to start {} loopback: {error}", source.channel_id),
            );
            args.done_flag.store(true, Ordering::Release);
            if should_uninit {
                unsafe { CoUninitialize() };
            }
            return;
        }
    }

    if let Err(error) = unsafe { monitor.client.Start() } {
        set_error(
            &args.shared_status,
            format!("Failed to start monitor output: {error}"),
        );
        for source in &sources {
            let _ = unsafe { source.client.Stop() };
        }
        args.done_flag.store(true, Ordering::Release);
        if should_uninit {
            unsafe { CoUninitialize() };
        }
        return;
    }

    {
        let mut status = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
        for source in &sources {
            update_source_status(&mut status.sources, source, true, true);
        }
        status.monitor_output.output.start_ok = true;
        status.monitor_output.output.active = true;
        status.state = BridgeState::Running;
        status.running = true;
        status.auto_started = args.config.auto_started;
        status.started_at = Some(chrono::Utc::now().to_rfc3339());
        status.updated_at = chrono::Utc::now().to_rfc3339();
    }

    let mut primed_frames: u64 = 0;
    if let Ok(buffer_ptr) = unsafe { monitor.render.GetBuffer((monitor.buffer_size / 2) as u32) } {
        let samples = (monitor.buffer_size as usize / 2) * monitor.out_channels;
        if monitor.is_float {
            let output = unsafe { std::slice::from_raw_parts_mut(buffer_ptr as *mut f32, samples) };
            output.fill(0.0);
        } else if monitor.bits_per_sample == 16 {
            let output = unsafe { std::slice::from_raw_parts_mut(buffer_ptr as *mut i16, samples) };
            output.fill(0);
        }
        let _ = unsafe { monitor.render.ReleaseBuffer((monitor.buffer_size / 2) as u32, 0) };
        primed_frames = (monitor.buffer_size / 2) as u64;
    }

    let target_frames = ((TARGET_BUFFER_MS as f64 / 1000.0) * monitor.out_rate as f64) as usize;
    let max_frames = ((MAX_BUFFER_MS as f64 / 1000.0) * monitor.out_rate as f64) as usize;
    let mut silence_staging: Vec<f32> = vec![0.0; 8192];
    let mut render_out: Vec<f32> = Vec::new();
    let mut render_i16: Vec<i16> = Vec::new();
    let mut post_dsp_peak: f32 = 0.0;
    let mut post_dsp_sum_sq: f64 = 0.0;
    let mut post_dsp_sample_count: u64 = 0;
    let mut output_frames_written: u64 = 0;
    let mut output_bytes_written: u64 = 0;
    let mut output_underruns: u64 = 0;
    let mut render_padding_last: u32 = 0;
    let mut iteration: u64 = 0;

    let dsp_shared = crate::audio_engine::dsp::config::global();
    let mut dsp_pipeline = crate::audio_engine::dsp::DspPipeline::new();
    dsp_pipeline.prepare(
        monitor.out_rate as f32,
        monitor.out_channels,
        dsp_shared,
        monitor.is_float,
        monitor.bits_per_sample,
    );

    loop {
        if args.stop_flag.load(Ordering::Relaxed) {
            break;
        }

        dsp_pipeline.maybe_refresh();

        for source in &mut sources {
            loop {
                let next = match unsafe { source.capture.GetNextPacketSize() } {
                    Ok(value) => value,
                    Err(_) => break,
                };
                if next == 0 {
                    break;
                }

                let mut data_ptr: *mut u8 = std::ptr::null_mut();
                let mut frames: u32 = 0;
                let mut flags: u32 = 0;

                if unsafe {
                    source
                        .capture
                        .GetBuffer(&mut data_ptr, &mut frames, &mut flags, None, None)
                }
                .is_err()
                {
                    break;
                }

                if frames > 0 {
                    source.packets += 1;
                    source.frames += frames as u64;
                    source.bytes +=
                        (frames as u64) * (source.channels as u64) * (source.bits_per_sample as u64 / 8);

                    let silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0;
                    let discontinuity = (flags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY) != 0;
                    if silent {
                        source.silence_count += 1;
                    }
                    if discontinuity {
                        source.discontinuity_count += 1;
                    }

                    let samples = frames as usize * source.channels;
                    if silence_staging.len() < samples {
                        silence_staging.resize(samples, 0.0);
                    }

                    let packet_owned: Vec<f32> = if silent || data_ptr.is_null() {
                        silence_staging[..samples].to_vec()
                    } else if source.is_float {
                        let slice =
                            unsafe { std::slice::from_raw_parts(data_ptr as *const f32, samples) };
                        update_source_levels(source, slice);
                        slice.to_vec()
                    } else if source.bits_per_sample == 16 {
                        let slice =
                            unsafe { std::slice::from_raw_parts(data_ptr as *const i16, samples) };
                        let mut converted = vec![0.0f32; samples];
                        for (index, value) in slice.iter().enumerate() {
                            converted[index] = *value as f32 / 32768.0;
                        }
                        update_source_levels(source, &converted);
                        converted
                    } else {
                        let _ = unsafe { source.capture.ReleaseBuffer(frames) };
                        set_error(
                            &args.shared_status,
                            format!(
                                "Unsupported source format for {}. Only float32/pcm16 supported.",
                                source.channel_id
                            ),
                        );
                        args.done_flag.store(true, Ordering::Release);
                        if should_uninit {
                            unsafe { CoUninitialize() };
                        }
                        return;
                    };

                    let pushed: Vec<f32> = if let Some(resampler) = source.resampler.as_mut() {
                        resampler.resample(&packet_owned)
                    } else {
                        packet_owned
                    };

                    trim_source_buffer(source, pushed.len(), target_frames, max_frames);
                    source.buffer.extend_from_slice(&pushed);
                }

                let _ = unsafe { source.capture.ReleaseBuffer(frames) };
            }
        }

        let padding = unsafe { monitor.client.GetCurrentPadding() }.unwrap_or(monitor.buffer_size);
        render_padding_last = padding;
        let available_frames = monitor.buffer_size.saturating_sub(padding) as usize;
        if available_frames > 0 {
            let output_samples = available_frames * monitor.out_channels;
            render_out.clear();
            render_out.resize(output_samples, 0.0);

            for source in &mut sources {
                let available_source_frames = (source.buffer.len().saturating_sub(source.read_index))
                    / source.channels.max(1);
                let gain = channel_gain_linear(source.channel_id).unwrap_or(1.0);

                if gain > 0.0 {
                    let source_frames_to_mix = available_source_frames.min(available_frames);
                    for frame_index in 0..source_frames_to_mix {
                        let start = source.read_index + frame_index * source.channels;
                        let end = start + source.channels;
                        let frame = &source.buffer[start..end];
                        for out_ch in 0..monitor.out_channels {
                            let sample = crate::audio_engine::routing::sample_for_output_channel(
                                frame,
                                source.channels,
                                out_ch,
                                monitor.out_channels,
                            );
                            render_out[frame_index * monitor.out_channels + out_ch] += sample * gain;
                        }
                    }
                }

                let consumed_frames = available_source_frames.min(available_frames);
                source.read_index += consumed_frames * source.channels;
                if source.read_index > source.buffer.capacity() / 2 {
                    source.buffer.drain(..source.read_index);
                    source.read_index = 0;
                }
            }

            for (index, sample) in render_out.iter_mut().enumerate() {
                let processed = dsp_pipeline.process_routing_sample(*sample, index % monitor.out_channels);
                *sample = processed;
                let abs = processed.abs();
                if abs > post_dsp_peak {
                    post_dsp_peak = abs;
                }
                post_dsp_sum_sq += (processed * processed) as f64;
            }
            post_dsp_sample_count += output_samples as u64;

            match unsafe { monitor.render.GetBuffer(available_frames as u32) } {
                Ok(buffer_ptr) => {
                    if monitor.is_float {
                        let output = unsafe {
                            std::slice::from_raw_parts_mut(buffer_ptr as *mut f32, output_samples)
                        };
                        output.copy_from_slice(&render_out);
                    } else if monitor.bits_per_sample == 16 {
                        render_i16.clear();
                        render_i16.reserve(output_samples);
                        for sample in &render_out {
                            render_i16.push((sample.clamp(-1.0, 1.0) * 32767.0) as i16);
                        }
                        let output = unsafe {
                            std::slice::from_raw_parts_mut(buffer_ptr as *mut i16, output_samples)
                        };
                        output.copy_from_slice(&render_i16);
                    }

                    let _ = unsafe { monitor.render.ReleaseBuffer(available_frames as u32, 0) };
                    output_frames_written += available_frames as u64;
                    output_bytes_written +=
                        (available_frames as u64)
                            * (monitor.out_channels as u64)
                            * (monitor.bits_per_sample as u64 / 8);
                }
                Err(_) => {
                    output_underruns += 1;
                }
            }
        }

        iteration += 1;
        if iteration % 25 == 0 {
            let mut status = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
            for source in &sources {
                update_source_status(&mut status.sources, source, true, true);
            }
            status.monitor_output.render_buffer_frames = monitor.buffer_size;
            status.monitor_output.render_padding_frames = render_padding_last as u64;
            status.monitor_output.primed_frames = primed_frames;
            status.monitor_output.target_buffer_ms = TARGET_BUFFER_MS as f64;
            status.monitor_output.buffer_fill_ms = sources
                .iter()
                .map(|source| {
                    let pending =
                        (source.buffer.len().saturating_sub(source.read_index)) / source.channels.max(1);
                    if monitor.out_rate > 0 {
                        (pending as f64 / monitor.out_rate as f64) * 1000.0
                    } else {
                        0.0
                    }
                })
                .fold(0.0, f64::max);
            status.monitor_output.output.frames_written = output_frames_written;
            status.monitor_output.output.bytes_written = output_bytes_written;
            status.monitor_output.output.underruns = output_underruns;
            let dsp_rms = if post_dsp_sample_count > 0 {
                ((post_dsp_sum_sq / post_dsp_sample_count as f64).sqrt()) as f32
            } else {
                0.0
            };
            status.dsp_enabled = crate::audio_engine::dsp::config::global()
                .enabled
                .load(Ordering::Relaxed);
            status.post_dsp_peak = post_dsp_peak;
            status.post_dsp_rms = dsp_rms;
            status.updated_at = chrono::Utc::now().to_rfc3339();
        }

        std::thread::sleep(std::time::Duration::from_millis(if available_frames > 0 { 4 } else { 8 }));
    }

    dsp_pipeline.deactivate();
    for source in &sources {
        let _ = unsafe { source.client.Stop() };
    }
    let _ = unsafe { monitor.client.Stop() };

    {
        let mut status = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
        status.state = BridgeState::Stopped;
        status.running = false;
        status.monitor_output.output.active = false;
        for source in &mut status.sources {
            source.active = false;
            source.stream.active = false;
        }
        status.updated_at = chrono::Utc::now().to_rfc3339();
    }

    if should_uninit {
        unsafe { CoUninitialize() };
    }
    args.done_flag.store(true, Ordering::Release);
}

#[cfg(windows)]
fn update_source_levels(source: &mut SourceStream, packet: &[f32]) {
    for value in packet {
        let abs = value.abs();
        if abs > source.peak {
            source.peak = abs;
        }
        source.sum_sq += (*value * *value) as f64;
    }
    source.sample_count += packet.len() as u64;
}

#[cfg(windows)]
fn trim_source_buffer(
    source: &mut SourceStream,
    incoming_samples: usize,
    target_frames: usize,
    max_frames: usize,
) {
    let pending_samples = source.buffer.len().saturating_sub(source.read_index);
    let max_samples = max_frames * source.channels.max(1);
    let target_samples = target_frames * source.channels.max(1);
    if pending_samples + incoming_samples > max_samples {
        let trim = (pending_samples + incoming_samples).saturating_sub(target_samples);
        source.read_index = (source.read_index + trim).min(source.buffer.len());
        source.dropped_frames += (trim / source.channels.max(1)) as u64;
    }
    if source.read_index > source.buffer.capacity() / 2 {
        source.buffer.drain(..source.read_index);
        source.read_index = 0;
    }
}

#[cfg(windows)]
fn update_source_status(
    sources: &mut [MultichannelSourceStatus],
    source: &SourceStream,
    initialize_ok: bool,
    start_ok: bool,
) {
    let Some(status) = sources.iter_mut().find(|item| item.channel_id == source.channel_id) else {
        return;
    };

    let runtime = runtime_channel_snapshot(source.channel_id);
    status.endpoint_id = Some(source.endpoint_id.clone());
    status.endpoint_name = Some(source.endpoint_name.clone());
    status.input_format = Some(source.input_format.clone());
    status.available = true;
    status.active = start_ok;
    status.pending_frames =
        (source.buffer.len().saturating_sub(source.read_index) / source.channels.max(1)) as u64;
    status.dropped_frames = source.dropped_frames;
    status.discontinuity_count = source.discontinuity_count;
    status.resampler_active = source.resampler.is_some();
    status.resampler_ratio = source
        .resampler
        .as_ref()
        .map(|resampler| resampler.ratio())
        .unwrap_or(1.0);
    status.gain_percent = runtime.as_ref().map(|item| item.volume_percent).unwrap_or(100);
    status.muted = runtime.as_ref().map(|item| item.muted).unwrap_or(false);
    status.stream.active = start_ok;
    status.stream.initialize_ok = initialize_ok;
    status.stream.start_ok = start_ok;
    status.stream.packets_read = source.packets;
    status.stream.frames_read = source.frames;
    status.stream.bytes_read = source.bytes;
    status.stream.silence_count = source.silence_count;
    status.stream.peak = source.peak;
    status.stream.rms = if source.sample_count > 0 {
        ((source.sum_sq / source.sample_count as f64).sqrt()) as f32
    } else {
        0.0
    };
}

#[cfg(windows)]
fn open_by_id(
    enumerator: &windows::Win32::Media::Audio::IMMDeviceEnumerator,
    id: &str,
) -> Option<windows::Win32::Media::Audio::IMMDevice> {
    let hid = windows::core::HSTRING::from(id);
    unsafe { enumerator.GetDevice(&hid).ok() }
}

/// Read the current Windows default render endpoint (id + friendly name) for
/// honest status reporting. Returns (None, None) when no default is available.
#[cfg(windows)]
fn read_default_render(
    enumerator: &windows::Win32::Media::Audio::IMMDeviceEnumerator,
) -> (Option<String>, Option<String>) {
    use windows::Win32::Media::Audio::{eMultimedia, eRender};
    match unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) } {
        Ok(device) => {
            let name = get_friendly_name(&device);
            (get_device_id(&device), Some(name).filter(|n| !n.is_empty()))
        }
        Err(_) => (None, None),
    }
}

#[cfg(windows)]
fn get_friendly_name(device: &windows::Win32::Media::Audio::IMMDevice) -> String {
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;
    use windows::Win32::System::Com::{CoTaskMemFree, STGM_READ};
    unsafe {
        let Ok(store) = device.OpenPropertyStore(STGM_READ) else {
            return String::new();
        };
        let Ok(value) = store.GetValue(&PKEY_Device_FriendlyName) else {
            return String::new();
        };
        let Ok(text) = PropVariantToStringAlloc(&value) else {
            return String::new();
        };
        if text.is_null() {
            return String::new();
        }
        let mut length = 0usize;
        while *text.0.add(length) != 0 {
            length += 1;
        }
        let name = String::from_utf16_lossy(std::slice::from_raw_parts(text.0, length));
        CoTaskMemFree(Some(text.0 as _));
        name
    }
}

#[cfg(windows)]
fn get_device_id(device: &windows::Win32::Media::Audio::IMMDevice) -> Option<String> {
    use windows::Win32::System::Com::CoTaskMemFree;
    unsafe {
        let pwstr = device.GetId().ok()?;
        if pwstr.is_null() {
            return None;
        }
        let mut len = 0usize;
        while *pwstr.0.add(len) != 0 {
            len += 1;
        }
        let id = String::from_utf16_lossy(std::slice::from_raw_parts(pwstr.0, len));
        CoTaskMemFree(Some(pwstr.0 as _));
        Some(id)
    }
}

#[cfg(windows)]
unsafe fn parse_wfx(
    fmt: *mut windows::Win32::Media::Audio::WAVEFORMATEX,
) -> (u32, usize, u16, bool) {
    use windows::Win32::Media::Audio::WAVEFORMATEXTENSIBLE;
    let wfx = &*fmt;
    let sample_rate = wfx.nSamplesPerSec;
    let channels = wfx.nChannels as usize;
    let bits_per_sample = wfx.wBitsPerSample;
    let is_float = if wfx.wFormatTag == WAVE_FORMAT_IEEE_FLOAT {
        true
    } else if wfx.wFormatTag == WAVE_FORMAT_EXTENSIBLE {
        let ext = fmt as *const WAVEFORMATEXTENSIBLE;
        let sub = std::ptr::read_unaligned(std::ptr::addr_of!((*ext).SubFormat));
        sub == SUBTYPE_IEEE_FLOAT
    } else {
        false
    };
    (sample_rate, channels, bits_per_sample, is_float)
}

#[cfg(windows)]
fn open_loopback_capture(
    device: &windows::Win32::Media::Audio::IMMDevice,
) -> Result<
    (
        windows::Win32::Media::Audio::IAudioClient,
        windows::Win32::Media::Audio::IAudioCaptureClient,
        usize,
        u32,
        u16,
        bool,
    ),
    String,
> {
    use windows::Win32::Media::Audio::{
        IAudioCaptureClient, IAudioClient, AUDCLNT_SHAREMODE_SHARED,
    };
    use windows::Win32::System::Com::{CoTaskMemFree, CLSCTX_ALL};

    let client: IAudioClient = unsafe { device.Activate::<IAudioClient>(CLSCTX_ALL, None) }
        .map_err(|error| format!("Activate failed: {error}"))?;

    let format_ptr =
        unsafe { client.GetMixFormat() }.map_err(|error| format!("GetMixFormat failed: {error}"))?;
    if format_ptr.is_null() {
        return Err("GetMixFormat returned null.".to_string());
    }

    let (rate, channels, bits_per_sample, is_float) = unsafe { parse_wfx(format_ptr) };
    let result = unsafe {
        client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK,
            BUFFER_100NS,
            0,
            format_ptr,
            None,
        )
    };
    unsafe { CoTaskMemFree(Some(format_ptr as *const _ as _)) };
    result.map_err(|error| format!("Initialize (loopback) failed: {error}"))?;

    let capture: IAudioCaptureClient = unsafe { client.GetService::<IAudioCaptureClient>() }
        .map_err(|error| format!("GetService (capture) failed: {error}"))?;

    Ok((client, capture, channels, rate, bits_per_sample, is_float))
}

#[cfg(windows)]
fn open_monitor_render(
    device: &windows::Win32::Media::Audio::IMMDevice,
) -> Result<MonitorStream, String> {
    use windows::Win32::Media::Audio::{
        IAudioClient, IAudioRenderClient, AUDCLNT_SHAREMODE_SHARED,
    };
    use windows::Win32::System::Com::{CoTaskMemFree, CLSCTX_ALL};

    let client: IAudioClient = unsafe { device.Activate::<IAudioClient>(CLSCTX_ALL, None) }
        .map_err(|error| format!("Activate failed: {error}"))?;

    let format_ptr =
        unsafe { client.GetMixFormat() }.map_err(|error| format!("GetMixFormat failed: {error}"))?;
    if format_ptr.is_null() {
        return Err("GetMixFormat returned null.".to_string());
    }

    let (rate, channels, bits_per_sample, is_float) = unsafe { parse_wfx(format_ptr) };
    let result =
        unsafe { client.Initialize(AUDCLNT_SHAREMODE_SHARED, 0, BUFFER_100NS, 0, format_ptr, None) };
    unsafe { CoTaskMemFree(Some(format_ptr as *const _ as _)) };
    result.map_err(|error| format!("Initialize (monitor render) failed: {error}"))?;

    let buffer_size =
        unsafe { client.GetBufferSize() }.map_err(|error| format!("GetBufferSize failed: {error}"))?;
    let render: IAudioRenderClient = unsafe { client.GetService::<IAudioRenderClient>() }
        .map_err(|error| format!("GetService (render) failed: {error}"))?;
    let output_name = get_friendly_name(device);
    let output_id = get_device_id(device).unwrap_or_default();
    let output_format = format!(
        "{}Hz {}ch {}",
        rate,
        channels,
        if is_float { "float32" } else { "pcm" }
    );

    Ok(MonitorStream {
        client,
        render,
        buffer_size,
        out_channels: channels,
        out_rate: rate,
        bits_per_sample,
        is_float,
        output_name,
        output_id,
        output_format,
    })
}
