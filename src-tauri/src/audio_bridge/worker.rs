use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::audio_bridge::resampler::LinearResampler;
use crate::audio_bridge::types::{BridgeMode, BridgePocConfig, BridgePocStatus, BridgeState};

pub struct BridgeWorkerArgs {
    pub config: BridgePocConfig,
    pub stop_flag: Arc<AtomicBool>,
    pub done_flag: Arc<AtomicBool>,
    pub shared_status: Arc<Mutex<BridgePocStatus>>,
}

pub fn run_bridge_worker(args: BridgeWorkerArgs) {
    #[cfg(windows)]
    {
        run_bridge_worker_windows(args);
        return;
    }
    #[cfg(not(windows))]
    {
        set_error(
            &args.shared_status,
            "Bridge POC requires Windows.".to_string(),
        );
        args.done_flag.store(true, Ordering::Release);
    }
}

fn set_error(shared: &Arc<Mutex<BridgePocStatus>>, msg: String) {
    if let Ok(mut s) = shared.lock() {
        s.state = BridgeState::Error;
        s.running = false;
        s.last_error = Some(msg);
        s.updated_at = chrono::Utc::now().to_rfc3339();
    }
}

// ---- Windows implementation ----

#[cfg(windows)]
const AUDCLNT_STREAMFLAGS_LOOPBACK: u32 = 0x00020000;
#[cfg(windows)]
const AUDCLNT_BUFFERFLAGS_SILENT: u32 = 0x00000002;
#[cfg(windows)]
const AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY: u32 = 0x00000001;
#[cfg(windows)]
const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
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
const MAX_LOOPBACK_BUF: usize = 96_000; // ~1 s stereo at 48000 Hz (unused after 16B ring-buf)
#[cfg(windows)]
const TARGET_BUFFER_MS: u64 = 50; // target pipeline fill
#[cfg(windows)]
const MAX_BUFFER_MS: u64 = 200; // hard cap before dropping oldest frames

#[cfg(windows)]
fn run_bridge_worker_windows(args: BridgeWorkerArgs) {
    use windows::core::HRESULT;
    use windows::Win32::Media::Audio::{
        eCapture, eRender, IAudioCaptureClient, IAudioClient, IAudioRenderClient, IMMDevice,
        IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106u32 as i32);

    // COM init
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
            Ok(e) => e,
            Err(e) => {
                set_error(
                    &args.shared_status,
                    format!("IMMDeviceEnumerator failed: {e}"),
                );
                args.done_flag.store(true, Ordering::Release);
                if should_uninit {
                    unsafe { CoUninitialize() };
                }
                return;
            }
        };

    // Find Audapp render endpoint
    let render_dev: Option<IMMDevice> = if let Some(ref id) = args.config.audapp_render_endpoint_id
    {
        open_by_id(&enumerator, id)
    } else {
        find_by_name(&enumerator, eRender, "audapp")
    };

    // Find Audapp capture endpoint
    let capture_dev: Option<IMMDevice> =
        if let Some(ref id) = args.config.audapp_capture_endpoint_id {
            open_by_id(&enumerator, id)
        } else {
            find_by_name(&enumerator, eCapture, "audapp")
        };

    {
        let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
        s.audapp_render_id = render_dev.as_ref().and_then(get_device_id);
        s.audapp_render_name = render_dev
            .as_ref()
            .map(|d| get_friendly_name(d))
            .filter(|n| !n.is_empty());
        s.audapp_capture_id = capture_dev.as_ref().and_then(get_device_id);
    }

    // ---- Loopback capture ----
    struct LoopStream {
        client: IAudioClient,
        capture: IAudioCaptureClient,
        channels: usize,
        rate: u32,
        is_float: bool,
    }

    let mut loopback: Option<LoopStream> = None;

    if args.config.enable_render_loopback_capture {
        match render_dev.as_ref() {
            None => {
                let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                s.render_loopback.last_error =
                    Some("Audapp render endpoint not found.".to_string());
            }
            Some(dev) => match open_loopback_capture(dev) {
                Err(e) => {
                    let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                    s.render_loopback.last_error = Some(e);
                }
                Ok((client, capture, channels, rate, is_float)) => {
                    let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                    s.render_loopback.initialize_ok = true;
                    s.input_format = Some(format!(
                        "{}Hz {}ch {}",
                        rate,
                        channels,
                        if is_float { "float32" } else { "pcm" }
                    ));
                    drop(s);
                    loopback = Some(LoopStream {
                        client,
                        capture,
                        channels,
                        rate,
                        is_float,
                    });
                }
            },
        }
    }

    // ---- Capture read ----
    struct CaptureStream {
        client: IAudioClient,
        capture: IAudioCaptureClient,
        channels: usize,
        is_float: bool,
    }

    let mut capstream: Option<CaptureStream> = None;

    if args.config.enable_capture_endpoint_read {
        match capture_dev.as_ref() {
            None => {
                let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                s.capture_read.last_error = Some("Audapp capture endpoint not found.".to_string());
            }
            Some(dev) => match open_capture_read(dev) {
                Err(e) => {
                    let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                    s.capture_read.last_error = Some(e);
                }
                Ok((client, capture, channels, is_float)) => {
                    let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                    s.capture_read.initialize_ok = true;
                    drop(s);
                    capstream = Some(CaptureStream {
                        client,
                        capture,
                        channels,
                        is_float,
                    });
                }
            },
        }
    }

    // ---- Physical monitor output ----
    struct MonitorStream {
        client: IAudioClient,
        render: IAudioRenderClient,
        buffer_size: u32,
        out_channels: usize,
        lb_channels: usize,
        out_rate: u32,
        is_float: bool,
    }

    let mut monitor: Option<MonitorStream> = None;
    let mut monitor_resampler: Option<LinearResampler> = None;
    let lb_channels = loopback.as_ref().map_or(2, |l| l.channels);
    let lb_rate = loopback.as_ref().map(|l| l.rate);
    let lb_is_float = loopback.as_ref().map_or(false, |l| l.is_float);

    let mut format_mismatch = false;

    if args.config.enable_physical_monitor_output {
        let audapp_render_id = render_dev.as_ref().and_then(get_device_id);
        let mon_dev: Option<IMMDevice> =
            if let Some(ref id) = args.config.monitor_output_endpoint_id {
                open_by_id(&enumerator, id)
            } else {
                find_non_audapp_default(&enumerator, audapp_render_id.as_deref())
            };

        match mon_dev.as_ref() {
            None => {
                let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                s.monitor_output.last_error =
                    Some("No physical render endpoint found.".to_string());
            }
            Some(dev) => match open_monitor_render(dev) {
                Err(e) => {
                    let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                    s.monitor_output.last_error = Some(e);
                }
                Ok((client, render_client, buffer_size, out_channels, rate, is_float)) => {
                    let out_fmt = format!(
                        "{}Hz {}ch {}",
                        rate,
                        out_channels,
                        if is_float { "float32" } else { "pcm" }
                    );
                    if lb_rate.map_or(false, |r| r != rate) {
                        // Rate mismatch: use resampler if both sides are float32
                        if is_float && lb_is_float {
                            let rs =
                                LinearResampler::new(lb_rate.unwrap_or(rate), rate, lb_channels);
                            {
                                let mut s =
                                    args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                                s.monitor_output_id = mon_dev.as_ref().and_then(get_device_id);
                                s.monitor_output_name = mon_dev
                                    .as_ref()
                                    .map(|d| get_friendly_name(d))
                                    .filter(|n| !n.is_empty());
                                s.output_format = Some(out_fmt);
                                s.resampler_active = true;
                                s.resampler_ratio = rs.ratio();
                                s.monitor_output.initialize_ok = true;
                            }
                            monitor_resampler = Some(rs);
                            monitor = Some(MonitorStream {
                                client,
                                render: render_client,
                                buffer_size,
                                out_channels,
                                lb_channels,
                                out_rate: rate,
                                is_float,
                            });
                        } else {
                            // Non-float: cannot resample in this phase
                            format_mismatch = true;
                            let mut s =
                                args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                            s.output_format = Some(out_fmt.clone());
                            s.monitor_output.last_error = Some(format!(
                                "Format mismatch: input={}Hz, output={}Hz, non-float. Cannot resample.",
                                lb_rate.unwrap_or(0),
                                rate
                            ));
                        }
                    } else {
                        // Same rate: direct copy
                        let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                        s.monitor_output_id = mon_dev.as_ref().and_then(get_device_id);
                        s.monitor_output_name = mon_dev
                            .as_ref()
                            .map(|d| get_friendly_name(d))
                            .filter(|n| !n.is_empty());
                        s.output_format = Some(out_fmt);
                        s.monitor_output.initialize_ok = true;
                        drop(s);
                        monitor = Some(MonitorStream {
                            client,
                            render: render_client,
                            buffer_size,
                            out_channels,
                            lb_channels,
                            out_rate: rate,
                            is_float,
                        });
                    }
                }
            },
        }
    }

    // ---- Start streams ----
    let mut lb_started = false;
    let mut cap_started = false;

    if let Some(ref ls) = loopback {
        match unsafe { ls.client.Start() } {
            Ok(()) => {
                let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                s.render_loopback.start_ok = true;
                s.render_loopback.active = true;
                lb_started = true;
            }
            Err(e) => {
                let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                s.render_loopback.last_error = Some(format!("Start failed: {e}"));
            }
        }
    }

    if let Some(ref cs) = capstream {
        match unsafe { cs.client.Start() } {
            Ok(()) => {
                let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                s.capture_read.start_ok = true;
                s.capture_read.active = true;
                cap_started = true;
            }
            Err(e) => {
                let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                s.capture_read.last_error = Some(format!("Start failed: {e}"));
            }
        }
    }

    if let Some(ref ms) = monitor {
        match unsafe { ms.client.Start() } {
            Ok(()) => {
                let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                s.monitor_output.start_ok = true;
                s.monitor_output.active = true;
            }
            Err(e) => {
                let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
                s.monitor_output.last_error = Some(format!("Start failed: {e}"));
            }
        }
    }

    if !lb_started && !cap_started {
        set_error(
            &args.shared_status,
            "No capture streams started successfully.".to_string(),
        );
        if let Some(ref ms) = monitor {
            let _ = unsafe { ms.client.Stop() };
        }
        if should_uninit {
            unsafe { CoUninitialize() };
        }
        args.done_flag.store(true, Ordering::Release);
        return;
    }

    {
        let now = chrono::Utc::now().to_rfc3339();
        let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
        s.state = BridgeState::Running;
        s.running = true;
        s.mode = if monitor.is_some() {
            if monitor_resampler.is_some() {
                BridgeMode::ResampledPassthrough
            } else {
                BridgeMode::Passthrough
            }
        } else if format_mismatch {
            BridgeMode::FormatMismatch
        } else {
            BridgeMode::CaptureOnly
        };
        s.started_at = Some(now.clone());
        s.updated_at = now;
    }

    // ---- Pre-loop setup ----
    let src_ch = lb_channels.max(1);
    let mon_out_rate = monitor.as_ref().map_or(48000u32, |ms| ms.out_rate);
    let mon_buf_size = monitor.as_ref().map_or(0u32, |ms| ms.buffer_size);

    // Target ~50ms of output buffering; hard cap at 200ms.
    let mon_target_samples =
        ((TARGET_BUFFER_MS as f64 / 1000.0) * mon_out_rate as f64) as usize * src_ch;
    let mon_max_samples = ((MAX_BUFFER_MS as f64 / 1000.0) * mon_out_rate as f64) as usize * src_ch;

    // Pre-allocated silence staging for AUDCLNT_BUFFERFLAGS_SILENT packet fill.
    // Keeping zeros in the pipeline eliminates the starvation→burst chop pattern.
    let mut silence_staging: Vec<f32> = vec![0.0f32; 8192];

    // Prime the render buffer with silence before live data to prevent initial underruns.
    let mut primed_frames: u64 = 0;
    if let Some(ref ms) = monitor {
        let prime = (ms.buffer_size / 2) as usize;
        if prime > 0 {
            if let Ok(buf_ptr) = unsafe { ms.render.GetBuffer(prime as u32) } {
                let out_s = prime * ms.out_channels;
                let sl = unsafe { std::slice::from_raw_parts_mut(buf_ptr as *mut f32, out_s) };
                sl.fill(0.0);
                let _ = unsafe { ms.render.ReleaseBuffer(prime as u32, 0) };
                primed_frames = prime as u64;
            }
        }
    }

    // ---- Per-iteration counters ----
    let mut lb_packets: u64 = 0;
    let mut lb_frames: u64 = 0;
    let mut lb_bytes: u64 = 0;
    let mut lb_silence: u64 = 0;
    let mut lb_discontinuity: u64 = 0;
    let mut lb_peak: f32 = 0.0;
    let mut lb_sum_sq: f64 = 0.0;
    let mut lb_sample_count: u64 = 0;

    let mut cap_packets: u64 = 0;
    let mut cap_frames: u64 = 0;
    let mut cap_bytes: u64 = 0;
    let mut cap_silence: u64 = 0;
    let mut cap_discontinuity: u64 = 0;
    let mut cap_peak: f32 = 0.0;
    let mut cap_sum_sq: f64 = 0.0;
    let mut cap_sample_count: u64 = 0;

    let mut mon_frames_written: u64 = 0;
    let mut mon_bytes_written: u64 = 0;
    let mut mon_underruns: u64 = 0;
    let mut mon_dropped: u64 = 0;
    let mut mon_dsp_peak: f32 = 0.0;
    let mut mon_dsp_sum_sq: f64 = 0.0;
    let mut mon_dsp_sample_count: u64 = 0;

    // Ring buffer with read-pointer: avoids O(n_remaining) Vec::drain on every render write.
    // Compact only when read pointer passes half capacity — O(1) amortised.
    let cap = mon_max_samples + 16384;
    let mut loopback_buf: Vec<f32> = Vec::with_capacity(cap);
    let mut loopback_read: usize = 0;

    let mut render_padding_last: u32 = 0;
    let mut iter: u64 = 0;

    // ---- DSP pipeline for bridge output (master gain, EQ, limiter on mixed stream) ----
    let mut dsp_pipeline = crate::audio_engine::dsp::DspPipeline::new();
    if let Some(ref ms) = monitor {
        if ms.is_float {
            let dsp_shared = crate::audio_engine::dsp::config::global();
            dsp_pipeline.prepare(ms.out_rate as f32, ms.out_channels, dsp_shared, true, 32);
        }
    }

    // ---- Main poll loop ----
    loop {
        if args.stop_flag.load(Ordering::Relaxed) {
            break;
        }

        dsp_pipeline.maybe_refresh();

        // Read loopback packets
        if lb_started {
            if let Some(ref ls) = loopback {
                loop {
                    let next = match unsafe { ls.capture.GetNextPacketSize() } {
                        Ok(n) => n,
                        Err(_) => break,
                    };
                    if next == 0 {
                        break;
                    }

                    let mut data_ptr: *mut u8 = std::ptr::null_mut();
                    let mut frames: u32 = 0;
                    let mut flags: u32 = 0;

                    if unsafe {
                        ls.capture
                            .GetBuffer(&mut data_ptr, &mut frames, &mut flags, None, None)
                    }
                    .is_err()
                    {
                        break;
                    }

                    if frames > 0 {
                        lb_packets += 1;
                        lb_frames += frames as u64;
                        lb_bytes += (frames as u64) * (ls.channels as u64) * 4;

                        let silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0;
                        let discontinuity = (flags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY) != 0;
                        if silent {
                            lb_silence += 1;
                        }
                        if discontinuity {
                            lb_discontinuity += 1;
                        }
                        let samples = frames as usize * ls.channels;

                        if ls.is_float {
                            // Track peak/rms for real (non-silent) audio only
                            if !silent && !data_ptr.is_null() {
                                let slice = unsafe {
                                    std::slice::from_raw_parts(data_ptr as *const f32, samples)
                                };
                                for &v in slice {
                                    let a = v.abs();
                                    if a > lb_peak {
                                        lb_peak = a;
                                    }
                                    lb_sum_sq += (v * v) as f64;
                                }
                                lb_sample_count += samples as u64;
                            }

                            // Always push to pipeline — silence → zeros keeps timing intact,
                            // preventing the starvation→burst pattern that causes choppiness.
                            let to_push: &[f32] = if !silent && !data_ptr.is_null() {
                                unsafe {
                                    std::slice::from_raw_parts(data_ptr as *const f32, samples)
                                }
                            } else {
                                if silence_staging.len() < samples {
                                    silence_staging.resize(samples, 0.0);
                                }
                                &silence_staging[..samples]
                            };

                            // Trim oldest frames if we'd exceed the max cap
                            let avail = loopback_buf.len() - loopback_read;
                            if let Some(ref mut rs) = monitor_resampler {
                                let resampled = rs.resample(to_push);
                                let n = resampled.len();
                                if avail + n > mon_max_samples {
                                    let trim = (avail + n).saturating_sub(mon_target_samples);
                                    loopback_read = (loopback_read + trim).min(loopback_buf.len());
                                    mon_dropped += (trim / src_ch) as u64;
                                }
                                if loopback_read > loopback_buf.capacity() / 2 {
                                    loopback_buf.drain(..loopback_read);
                                    loopback_read = 0;
                                }
                                loopback_buf.extend_from_slice(&resampled);
                            } else {
                                if avail + samples > mon_max_samples {
                                    let trim = (avail + samples).saturating_sub(mon_target_samples);
                                    loopback_read = (loopback_read + trim).min(loopback_buf.len());
                                    mon_dropped += (trim / src_ch) as u64;
                                }
                                if loopback_read > loopback_buf.capacity() / 2 {
                                    loopback_buf.drain(..loopback_read);
                                    loopback_read = 0;
                                }
                                loopback_buf.extend_from_slice(to_push);
                            }
                        }
                    }

                    let _ = unsafe { ls.capture.ReleaseBuffer(frames) };
                }
            }
        }

        // Read capture endpoint packets
        if cap_started {
            if let Some(ref cs) = capstream {
                loop {
                    let next = match unsafe { cs.capture.GetNextPacketSize() } {
                        Ok(n) => n,
                        Err(_) => break,
                    };
                    if next == 0 {
                        break;
                    }

                    let mut data_ptr: *mut u8 = std::ptr::null_mut();
                    let mut frames: u32 = 0;
                    let mut flags: u32 = 0;

                    if unsafe {
                        cs.capture
                            .GetBuffer(&mut data_ptr, &mut frames, &mut flags, None, None)
                    }
                    .is_err()
                    {
                        break;
                    }

                    if frames > 0 {
                        cap_packets += 1;
                        cap_frames += frames as u64;
                        cap_bytes += (frames as u64) * (cs.channels as u64) * 4;

                        let silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0;
                        let discontinuity = (flags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY) != 0;
                        if silent {
                            cap_silence += 1;
                        }
                        if discontinuity {
                            cap_discontinuity += 1;
                        }
                        let samples = frames as usize * cs.channels;

                        if !silent && !data_ptr.is_null() && cs.is_float {
                            let slice = unsafe {
                                std::slice::from_raw_parts(data_ptr as *const f32, samples)
                            };
                            for &v in slice {
                                let a = v.abs();
                                if a > cap_peak {
                                    cap_peak = a;
                                }
                                cap_sum_sq += (v * v) as f64;
                            }
                            cap_sample_count += samples as u64;
                        }
                    }

                    let _ = unsafe { cs.capture.ReleaseBuffer(frames) };
                }
            }
        }

        // Write loopback pipeline to physical monitor output
        let mut render_padding: u32 = render_padding_last;
        if let Some(ref ms) = monitor {
            let padding = unsafe { ms.client.GetCurrentPadding() }.unwrap_or(ms.buffer_size);
            render_padding = padding;
            render_padding_last = padding;
            let avail_frames = ms.buffer_size.saturating_sub(padding) as usize;

            if avail_frames > 0 && ms.is_float {
                let buf_avail = loopback_buf.len() - loopback_read;
                let have_frames = buf_avail / src_ch;
                let write_frames = avail_frames.min(have_frames);

                if write_frames > 0 {
                    let src_start = loopback_read;
                    let src_end = loopback_read + write_frames * src_ch;
                    match unsafe { ms.render.GetBuffer(write_frames as u32) } {
                        Ok(buf_ptr) => {
                            let out_samples = write_frames * ms.out_channels;
                            let out = unsafe {
                                std::slice::from_raw_parts_mut(buf_ptr as *mut f32, out_samples)
                            };
                            mix_channels(
                                &loopback_buf[src_start..src_end],
                                src_ch,
                                out,
                                ms.out_channels,
                                write_frames,
                            );
                            // Apply bridge-output DSP (master gain, EQ, limiter) in-place.
                            // Operates on the mixed bridge stream — per-channel EQ requires
                            // separated streams and is a future phase.
                            let out_ch = ms.out_channels;
                            for i in 0..out_samples {
                                let processed =
                                    dsp_pipeline.process_routing_sample(out[i], i % out_ch);
                                out[i] = processed;
                                let abs = processed.abs();
                                if abs > mon_dsp_peak {
                                    mon_dsp_peak = abs;
                                }
                                mon_dsp_sum_sq += (processed * processed) as f64;
                            }
                            mon_dsp_sample_count += out_samples as u64;
                            loopback_read += write_frames * src_ch;
                            // Compact only when read pointer exceeds half capacity (amortised O(1))
                            if loopback_read > loopback_buf.capacity() / 2 {
                                loopback_buf.drain(..loopback_read);
                                loopback_read = 0;
                            }
                            let _ = unsafe { ms.render.ReleaseBuffer(write_frames as u32, 0) };
                            mon_frames_written += write_frames as u64;
                            mon_bytes_written +=
                                (write_frames as u64) * (ms.out_channels as u64) * 4;
                        }
                        Err(_) => {
                            mon_underruns += 1;
                        }
                    }
                }
            }
        }

        // Update shared status every ~50 iterations
        iter += 1;
        if iter % 50 == 0 {
            let lb_rms = if lb_sample_count > 0 {
                ((lb_sum_sq / lb_sample_count as f64).sqrt()) as f32
            } else {
                0.0
            };
            let cap_rms = if cap_sample_count > 0 {
                ((cap_sum_sq / cap_sample_count as f64).sqrt()) as f32
            } else {
                0.0
            };

            let pending = ((loopback_buf.len() - loopback_read) / src_ch) as u64;
            let fill_ms = if mon_out_rate > 0 {
                (pending as f64 / mon_out_rate as f64) * 1000.0
            } else {
                0.0
            };

            let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
            s.render_loopback.packets_read = lb_packets;
            s.render_loopback.frames_read = lb_frames;
            s.render_loopback.bytes_read = lb_bytes;
            s.render_loopback.silence_count = lb_silence;
            s.render_loopback.peak = lb_peak;
            s.render_loopback.rms = lb_rms;

            s.capture_read.packets_read = cap_packets;
            s.capture_read.frames_read = cap_frames;
            s.capture_read.bytes_read = cap_bytes;
            s.capture_read.silence_count = cap_silence;
            s.capture_read.peak = cap_peak;
            s.capture_read.rms = cap_rms;

            s.monitor_output.frames_written = mon_frames_written;
            s.monitor_output.bytes_written = mon_bytes_written;
            s.monitor_output.underruns = mon_underruns;
            s.pending_frames = pending;
            s.dropped_frames = mon_dropped;
            s.capture_discontinuity_count = lb_discontinuity + cap_discontinuity;
            s.render_buffer_frames = mon_buf_size;
            s.render_padding_frames = render_padding as u64;
            s.buffer_fill_ms = fill_ms;
            s.target_buffer_ms = TARGET_BUFFER_MS as f64;
            s.primed_frames = primed_frames;
            let dsp_rms = if mon_dsp_sample_count > 0 {
                ((mon_dsp_sum_sq / mon_dsp_sample_count as f64).sqrt()) as f32
            } else {
                0.0
            };
            s.dsp_enabled = crate::audio_engine::dsp::config::global()
                .enabled
                .load(Ordering::Relaxed);
            s.post_dsp_peak = mon_dsp_peak;
            s.post_dsp_rms = dsp_rms;
            s.updated_at = chrono::Utc::now().to_rfc3339();
        }

        // Adaptive sleep: poll faster when render buffer is low to prevent output starvation.
        let sleep_ms: u64 = if monitor.is_some() {
            let fill_ms = (render_padding as f64 / mon_out_rate as f64 * 1000.0) as u64;
            if fill_ms < 20 {
                3
            } else {
                8
            }
        } else {
            5
        };
        std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
    }

    dsp_pipeline.deactivate();

    // ---- Stop streams ----
    if let Some(ref ls) = loopback {
        let _ = unsafe { ls.client.Stop() };
    }
    if let Some(ref cs) = capstream {
        let _ = unsafe { cs.client.Stop() };
    }
    if let Some(ref ms) = monitor {
        let _ = unsafe { ms.client.Stop() };
    }

    {
        let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
        s.state = BridgeState::Stopped;
        s.running = false;
        s.render_loopback.active = false;
        s.capture_read.active = false;
        s.monitor_output.active = false;
        s.updated_at = chrono::Utc::now().to_rfc3339();
    }

    if should_uninit {
        unsafe { CoUninitialize() };
    }
    args.done_flag.store(true, Ordering::Release);
}

// Simple channel mixing: stereo<->mono conversion, same-channel copy.
fn mix_channels(src: &[f32], src_ch: usize, dst: &mut [f32], dst_ch: usize, frames: usize) {
    if src_ch == dst_ch {
        dst.copy_from_slice(&src[..frames * dst_ch]);
    } else if src_ch == 2 && dst_ch == 1 {
        for i in 0..frames {
            let l = src.get(i * 2).copied().unwrap_or(0.0);
            let r = src.get(i * 2 + 1).copied().unwrap_or(0.0);
            dst[i] = (l + r) * 0.5;
        }
    } else if src_ch == 1 && dst_ch == 2 {
        for i in 0..frames {
            let v = src.get(i).copied().unwrap_or(0.0);
            dst[i * 2] = v;
            dst[i * 2 + 1] = v;
        }
    } else {
        // Fallback: copy what fits, zero the rest
        for i in 0..frames {
            for c in 0..dst_ch {
                dst[i * dst_ch + c] = if c < src_ch {
                    src.get(i * src_ch + c).copied().unwrap_or(0.0)
                } else {
                    0.0
                };
            }
        }
    }
}

// ---- Windows helper functions ----

#[cfg(windows)]
fn get_friendly_name(device: &windows::Win32::Media::Audio::IMMDevice) -> String {
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;
    use windows::Win32::System::Com::{CoTaskMemFree, STGM_READ};
    unsafe {
        let store = match device.OpenPropertyStore(STGM_READ) {
            Ok(s) => s,
            Err(_) => return String::new(),
        };
        let val = match store.GetValue(&PKEY_Device_FriendlyName) {
            Ok(v) => v,
            Err(_) => return String::new(),
        };
        let pwstr = match PropVariantToStringAlloc(&val) {
            Ok(p) => p,
            Err(_) => return String::new(),
        };
        if pwstr.is_null() {
            return String::new();
        }
        let mut len = 0usize;
        while *pwstr.0.add(len) != 0 {
            len += 1;
        }
        let name = String::from_utf16_lossy(std::slice::from_raw_parts(pwstr.0, len));
        CoTaskMemFree(Some(pwstr.0 as _));
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
fn open_by_id(
    enumerator: &windows::Win32::Media::Audio::IMMDeviceEnumerator,
    id: &str,
) -> Option<windows::Win32::Media::Audio::IMMDevice> {
    let hid = windows::core::HSTRING::from(id);
    unsafe { enumerator.GetDevice(&hid).ok() }
}

#[cfg(windows)]
fn find_by_name(
    enumerator: &windows::Win32::Media::Audio::IMMDeviceEnumerator,
    flow: windows::Win32::Media::Audio::EDataFlow,
    keyword: &str,
) -> Option<windows::Win32::Media::Audio::IMMDevice> {
    use windows::Win32::Media::Audio::DEVICE_STATE_ACTIVE;
    let col = unsafe {
        enumerator
            .EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE)
            .ok()?
    };
    let count = unsafe { col.GetCount().ok()? };
    for i in 0..count {
        if let Ok(dev) = unsafe { col.Item(i) } {
            if get_friendly_name(&dev).to_lowercase().contains(keyword) {
                return Some(dev);
            }
        }
    }
    None
}

#[cfg(windows)]
fn find_non_audapp_default(
    enumerator: &windows::Win32::Media::Audio::IMMDeviceEnumerator,
    audapp_render_id: Option<&str>,
) -> Option<windows::Win32::Media::Audio::IMMDevice> {
    use windows::Win32::Media::Audio::{eMultimedia, eRender, DEVICE_STATE_ACTIVE};
    let default_dev = unsafe {
        enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .ok()?
    };
    let default_id = get_device_id(&default_dev)?;
    if audapp_render_id.map_or(true, |aid| aid != default_id) {
        return Some(default_dev);
    }
    // Default IS audapp; find another active render endpoint.
    let col = unsafe {
        enumerator
            .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
            .ok()?
    };
    let count = unsafe { col.GetCount().ok()? };
    for i in 0..count {
        if let Ok(dev) = unsafe { col.Item(i) } {
            if let Some(id) = get_device_id(&dev) {
                if audapp_render_id.map_or(true, |aid| aid != id) {
                    return Some(dev);
                }
            }
        }
    }
    None
}

#[cfg(windows)]
unsafe fn parse_wfx(fmt: *mut windows::Win32::Media::Audio::WAVEFORMATEX) -> (u32, usize, bool) {
    use windows::Win32::Media::Audio::WAVEFORMATEXTENSIBLE;
    let wfx = &*fmt;
    let rate = wfx.nSamplesPerSec;
    let channels = wfx.nChannels as usize;
    let is_float = if wfx.wFormatTag == WAVE_FORMAT_IEEE_FLOAT {
        true
    } else if wfx.wFormatTag == WAVE_FORMAT_EXTENSIBLE {
        let ext = fmt as *const WAVEFORMATEXTENSIBLE;
        let sub = std::ptr::read_unaligned(std::ptr::addr_of!((*ext).SubFormat));
        sub == SUBTYPE_IEEE_FLOAT
    } else {
        false
    };
    (rate, channels, is_float)
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
        bool,
    ),
    String,
> {
    use windows::Win32::Media::Audio::{
        IAudioCaptureClient, IAudioClient, AUDCLNT_SHAREMODE_SHARED,
    };
    use windows::Win32::System::Com::{CoTaskMemFree, CLSCTX_ALL};

    let client: IAudioClient = unsafe { device.Activate::<IAudioClient>(CLSCTX_ALL, None) }
        .map_err(|e| format!("Activate failed: {e}"))?;

    let fmt_ptr =
        unsafe { client.GetMixFormat() }.map_err(|e| format!("GetMixFormat failed: {e}"))?;
    if fmt_ptr.is_null() {
        return Err("GetMixFormat returned null.".to_string());
    }

    let (rate, channels, is_float) = unsafe { parse_wfx(fmt_ptr) };

    let r = unsafe {
        client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK,
            BUFFER_100NS,
            0,
            fmt_ptr,
            None,
        )
    };
    unsafe { CoTaskMemFree(Some(fmt_ptr as *const _ as _)) };
    r.map_err(|e| format!("Initialize (loopback) failed: {e}"))?;

    let capture: IAudioCaptureClient = unsafe { client.GetService::<IAudioCaptureClient>() }
        .map_err(|e| format!("GetService (capture) failed: {e}"))?;

    Ok((client, capture, channels, rate, is_float))
}

#[cfg(windows)]
fn open_capture_read(
    device: &windows::Win32::Media::Audio::IMMDevice,
) -> Result<
    (
        windows::Win32::Media::Audio::IAudioClient,
        windows::Win32::Media::Audio::IAudioCaptureClient,
        usize,
        bool,
    ),
    String,
> {
    use windows::Win32::Media::Audio::{
        IAudioCaptureClient, IAudioClient, AUDCLNT_SHAREMODE_SHARED,
    };
    use windows::Win32::System::Com::{CoTaskMemFree, CLSCTX_ALL};

    let client: IAudioClient = unsafe { device.Activate::<IAudioClient>(CLSCTX_ALL, None) }
        .map_err(|e| format!("Activate failed: {e}"))?;

    let fmt_ptr =
        unsafe { client.GetMixFormat() }.map_err(|e| format!("GetMixFormat failed: {e}"))?;
    if fmt_ptr.is_null() {
        return Err("GetMixFormat returned null.".to_string());
    }

    let (_rate, channels, is_float) = unsafe { parse_wfx(fmt_ptr) };

    let r =
        unsafe { client.Initialize(AUDCLNT_SHAREMODE_SHARED, 0, BUFFER_100NS, 0, fmt_ptr, None) };
    unsafe { CoTaskMemFree(Some(fmt_ptr as *const _ as _)) };
    r.map_err(|e| format!("Initialize (capture) failed: {e}"))?;

    let capture: IAudioCaptureClient = unsafe { client.GetService::<IAudioCaptureClient>() }
        .map_err(|e| format!("GetService (capture) failed: {e}"))?;

    Ok((client, capture, channels, is_float))
}

#[cfg(windows)]
fn open_monitor_render(
    device: &windows::Win32::Media::Audio::IMMDevice,
) -> Result<
    (
        windows::Win32::Media::Audio::IAudioClient,
        windows::Win32::Media::Audio::IAudioRenderClient,
        u32,
        usize,
        u32,
        bool,
    ),
    String,
> {
    use windows::Win32::Media::Audio::{
        IAudioClient, IAudioRenderClient, AUDCLNT_SHAREMODE_SHARED,
    };
    use windows::Win32::System::Com::{CoTaskMemFree, CLSCTX_ALL};

    let client: IAudioClient = unsafe { device.Activate::<IAudioClient>(CLSCTX_ALL, None) }
        .map_err(|e| format!("Activate failed: {e}"))?;

    let fmt_ptr =
        unsafe { client.GetMixFormat() }.map_err(|e| format!("GetMixFormat failed: {e}"))?;
    if fmt_ptr.is_null() {
        return Err("GetMixFormat returned null.".to_string());
    }

    let (rate, channels, is_float) = unsafe { parse_wfx(fmt_ptr) };

    let r =
        unsafe { client.Initialize(AUDCLNT_SHAREMODE_SHARED, 0, BUFFER_100NS, 0, fmt_ptr, None) };
    unsafe { CoTaskMemFree(Some(fmt_ptr as *const _ as _)) };
    r.map_err(|e| format!("Initialize (monitor render) failed: {e}"))?;

    let buffer_size =
        unsafe { client.GetBufferSize() }.map_err(|e| format!("GetBufferSize failed: {e}"))?;

    let render_client: IAudioRenderClient = unsafe { client.GetService::<IAudioRenderClient>() }
        .map_err(|e| format!("GetService (render) failed: {e}"))?;

    Ok((client, render_client, buffer_size, channels, rate, is_float))
}
