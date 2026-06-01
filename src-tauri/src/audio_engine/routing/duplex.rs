use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use crate::audio_engine::dsp::DspPipeline;
use crate::audio_engine::metrics::estimated_latency_ms;
use crate::audio_engine::routing::ring::F32Ring;
use crate::audio_engine::routing::safety::{sample_for_output_channel, SafetyCheckResult};
use crate::audio_engine::routing::types::{AudioRoutingRuntimeStatus, RoutingState};

const BUFFER_DURATION_100NS: i64 = 200_000; // 20 ms
const RING_CUSHION_MS: u32 = 200;

pub struct DuplexWorkerArgs {
    pub capture_device_id: String,
    pub render_device_id: String,
    pub safety: SafetyCheckResult,
    pub stop_flag: Arc<AtomicBool>,
    pub done_flag: Arc<AtomicBool>,
    pub peak_bits: Arc<AtomicU32>,
    pub rms_bits: Arc<AtomicU32>,
    pub glitch_count: Arc<AtomicU32>,
    pub underrun_count: Arc<AtomicU32>,
    pub overrun_count: Arc<AtomicU32>,
    pub ring_fill_bits: Arc<AtomicU32>,
    pub shared_status: Arc<Mutex<AudioRoutingRuntimeStatus>>,
}

pub fn run_duplex_worker(args: DuplexWorkerArgs) {
    #[cfg(windows)]
    {
        run_duplex_worker_windows(args);
        return;
    }

    #[cfg(not(windows))]
    {
        write_error(
            &args.shared_status,
            "Audio routing requires Windows.",
        );
        args.done_flag.store(true, Ordering::Release);
    }
}

#[cfg(windows)]
fn run_duplex_worker_windows(args: DuplexWorkerArgs) {
    use windows::core::HRESULT;
    use windows::Win32::Media::Audio::{
        IAudioCaptureClient, IAudioClient, IAudioRenderClient, IMMDeviceEnumerator,
        MMDeviceEnumerator, AUDCLNT_SHAREMODE_SHARED,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
        COINIT_MULTITHREADED,
    };

    const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106u32 as i32);
    const WAVE_FORMAT_PCM: u16 = 1;
    const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
    const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;
    const SUBTYPE_IEEE_FLOAT: windows::core::GUID = windows::core::GUID::from_values(
        0x00000003,
        0x0000,
        0x0010,
        [0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71],
    );

    let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let should_uninit = if hr.is_ok() {
        true
    } else if hr == RPC_E_CHANGED_MODE {
        false
    } else {
        write_error(&args.shared_status, &format!("COM init failed: {hr}"));
        args.done_flag.store(true, Ordering::Release);
        return;
    };

    let Ok(enumerator) = (unsafe {
        CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
    }) else {
        write_error(&args.shared_status, "Failed to create device enumerator.");
        args.done_flag.store(true, Ordering::Release);
        if should_uninit {
            unsafe { CoUninitialize() };
        }
        return;
    };

    let capture_device = match open_device(&enumerator, &args.capture_device_id) {
        Ok(d) => d,
        Err(msg) => {
            write_error(&args.shared_status, &msg);
            args.done_flag.store(true, Ordering::Release);
            if should_uninit {
                unsafe { CoUninitialize() };
            }
            return;
        }
    };

    let render_device = match open_device(&enumerator, &args.render_device_id) {
        Ok(d) => d,
        Err(msg) => {
            write_error(&args.shared_status, &msg);
            args.done_flag.store(true, Ordering::Release);
            if should_uninit {
                unsafe { CoUninitialize() };
            }
            return;
        }
    };

    let Ok(capture_client_iface) =
        (unsafe { capture_device.Activate::<IAudioClient>(CLSCTX_ALL, None) })
    else {
        write_error(&args.shared_status, "Failed to activate capture client.");
        args.done_flag.store(true, Ordering::Release);
        if should_uninit {
            unsafe { CoUninitialize() };
        }
        return;
    };

    let Ok(render_client_iface) =
        (unsafe { render_device.Activate::<IAudioClient>(CLSCTX_ALL, None) })
    else {
        write_error(&args.shared_status, "Failed to activate render client.");
        args.done_flag.store(true, Ordering::Release);
        if should_uninit {
            unsafe { CoUninitialize() };
        }
        return;
    };

    let cap_fmt_ptr = match unsafe { capture_client_iface.GetMixFormat() } {
        Ok(p) if !p.is_null() => p,
        Err(e) => {
            write_error(&args.shared_status, &format!("Capture GetMixFormat failed: {e}"));
            args.done_flag.store(true, Ordering::Release);
            if should_uninit {
                unsafe { CoUninitialize() };
            }
            return;
        }
        _ => {
            write_error(&args.shared_status, "Capture GetMixFormat returned null.");
            args.done_flag.store(true, Ordering::Release);
            if should_uninit {
                unsafe { CoUninitialize() };
            }
            return;
        }
    };

    let out_fmt_ptr = match unsafe { render_client_iface.GetMixFormat() } {
        Ok(p) if !p.is_null() => p,
        Err(e) => {
            unsafe { CoTaskMemFree(Some(cap_fmt_ptr as *const _ as _)) };
            write_error(&args.shared_status, &format!("Render GetMixFormat failed: {e}"));
            args.done_flag.store(true, Ordering::Release);
            if should_uninit {
                unsafe { CoUninitialize() };
            }
            return;
        }
        _ => {
            unsafe { CoTaskMemFree(Some(cap_fmt_ptr as *const _ as _)) };
            write_error(&args.shared_status, "Render GetMixFormat returned null.");
            args.done_flag.store(true, Ordering::Release);
            if should_uninit {
                unsafe { CoUninitialize() };
            }
            return;
        }
    };

    let (cap_rate, cap_ch, cap_bits, cap_float) = unsafe { read_wfx_info(cap_fmt_ptr) };
    let (out_rate, out_ch, out_bits, out_float) = unsafe { read_wfx_info(out_fmt_ptr) };

    if cap_rate != out_rate {
        unsafe {
            CoTaskMemFree(Some(cap_fmt_ptr as *const _ as _));
            CoTaskMemFree(Some(out_fmt_ptr as *const _ as _));
        }
        write_error(
            &args.shared_status,
            "Set both devices to the same sample rate, for example 48 kHz.",
        );
        args.done_flag.store(true, Ordering::Release);
        if should_uninit {
            unsafe { CoUninitialize() };
        }
        return;
    }

    if unsafe {
        capture_client_iface.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            0,
            BUFFER_DURATION_100NS,
            0,
            cap_fmt_ptr,
            None,
        )
    }
    .is_err()
    {
        unsafe {
            CoTaskMemFree(Some(cap_fmt_ptr as *const _ as _));
            CoTaskMemFree(Some(out_fmt_ptr as *const _ as _));
        }
        write_error(&args.shared_status, "Capture IAudioClient::Initialize failed.");
        args.done_flag.store(true, Ordering::Release);
        if should_uninit {
            unsafe { CoUninitialize() };
        }
        return;
    }

    if unsafe {
        render_client_iface.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            0,
            BUFFER_DURATION_100NS,
            0,
            out_fmt_ptr,
            None,
        )
    }
    .is_err()
    {
        unsafe {
            CoTaskMemFree(Some(cap_fmt_ptr as *const _ as _));
            CoTaskMemFree(Some(out_fmt_ptr as *const _ as _));
        }
        write_error(&args.shared_status, "Render IAudioClient::Initialize failed.");
        args.done_flag.store(true, Ordering::Release);
        if should_uninit {
            unsafe { CoUninitialize() };
        }
        return;
    }

    unsafe {
        CoTaskMemFree(Some(cap_fmt_ptr as *const _ as _));
        CoTaskMemFree(Some(out_fmt_ptr as *const _ as _));
    }

    let cap_buffer = match unsafe { capture_client_iface.GetBufferSize() } {
        Ok(s) => s,
        Err(_) => {
            write_error(&args.shared_status, "Capture GetBufferSize failed.");
            args.done_flag.store(true, Ordering::Release);
            if should_uninit {
                unsafe { CoUninitialize() };
            }
            return;
        }
    };

    let out_buffer = match unsafe { render_client_iface.GetBufferSize() } {
        Ok(s) => s,
        Err(_) => {
            write_error(&args.shared_status, "Render GetBufferSize failed.");
            args.done_flag.store(true, Ordering::Release);
            if should_uninit {
                unsafe { CoUninitialize() };
            }
            return;
        }
    };

    let Ok(capture_client) = (unsafe { capture_client_iface.GetService::<IAudioCaptureClient>() })
    else {
        write_error(&args.shared_status, "Failed to get capture client.");
        args.done_flag.store(true, Ordering::Release);
        if should_uninit {
            unsafe { CoUninitialize() };
        }
        return;
    };

    let Ok(render_client) = (unsafe { render_client_iface.GetService::<IAudioRenderClient>() })
    else {
        write_error(&args.shared_status, "Failed to get render client.");
        args.done_flag.store(true, Ordering::Release);
        if should_uninit {
            unsafe { CoUninitialize() };
        }
        return;
    };

    if unsafe { capture_client_iface.Start() }.is_err()
        || unsafe { render_client_iface.Start() }.is_err()
    {
        write_error(&args.shared_status, "Failed to start audio clients.");
        args.done_flag.store(true, Ordering::Release);
        if should_uninit {
            unsafe { CoUninitialize() };
        }
        return;
    }

    let in_ch = cap_ch as usize;
    let out_ch_usize = out_ch as usize;
    let sample_rate = cap_rate;

    let latency_ms =
        estimated_latency_ms(cap_buffer.max(out_buffer), sample_rate) as f32 + RING_CUSHION_MS as f32;

    {
        let mut s = args
            .shared_status
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        s.state = RoutingState::Running;
        s.sample_rate = Some(sample_rate);
        s.input_channels = Some(cap_ch);
        s.output_channels = Some(out_ch);
        s.buffer_frames = Some(cap_buffer.max(out_buffer));
        s.estimated_latency_ms = Some(latency_ms);
        s.warning = args.safety.warning.clone();
        s.updated_at = chrono::Utc::now().to_rfc3339();
    }

    let dsp_shared = crate::audio_engine::dsp::config::global();
    let mut dsp_pipeline = DspPipeline::new();
    dsp_pipeline.prepare(
        sample_rate as f32,
        out_ch_usize.max(in_ch).max(1),
        dsp_shared,
        out_float,
        out_bits,
    );

    let mut ring = F32Ring::with_capacity_ms(sample_rate, in_ch.max(1), RING_CUSHION_MS);
    let half_period = half_buffer_period(cap_buffer.max(out_buffer), sample_rate);

    let max_frames = cap_buffer.max(out_buffer) as usize;
    let mut capture_push = vec![0.0f32; max_frames * in_ch];
    let mut in_frame = vec![0.0f32; in_ch];
    let mut render_out = vec![0.0f32; max_frames * out_ch_usize];

    loop {
        if args.stop_flag.load(Ordering::Relaxed) {
            break;
        }

        dsp_pipeline.maybe_refresh();

        loop {
            let packet_size = match unsafe { capture_client.GetNextPacketSize() } {
                Ok(s) => s,
                Err(_) => {
                    args.glitch_count.fetch_add(1, Ordering::Relaxed);
                    break;
                }
            };
            if packet_size == 0 {
                break;
            }

            let mut data_ptr: *mut u8 = std::ptr::null_mut();
            let mut frames_available: u32 = 0;
            let mut flags: u32 = 0;

            if unsafe {
                capture_client.GetBuffer(
                    &mut data_ptr,
                    &mut frames_available,
                    &mut flags,
                    None,
                    None,
                )
            }
            .is_err()
            {
                args.glitch_count.fetch_add(1, Ordering::Relaxed);
                break;
            }

            if frames_available > 0 && !data_ptr.is_null() {
                let total = frames_available as usize * in_ch;
                if capture_push.len() < total {
                    capture_push.resize(total, 0.0);
                }

                if cap_float {
                    let slice =
                        unsafe { std::slice::from_raw_parts(data_ptr as *const f32, total) };
                    capture_push[..total].copy_from_slice(slice);
                } else if cap_bits == 16 {
                    let slice =
                        unsafe { std::slice::from_raw_parts(data_ptr as *const i16, total) };
                    for (i, &s) in slice.iter().enumerate() {
                        capture_push[i] = s as f32 / 32768.0;
                    }
                }

                ring.push_interleaved(&capture_push[..total]);
            }

            if unsafe { capture_client.ReleaseBuffer(frames_available) }.is_err() {
                args.glitch_count.fetch_add(1, Ordering::Relaxed);
                break;
            }
        }

        let padding = match unsafe { render_client_iface.GetCurrentPadding() } {
            Ok(p) => p,
            Err(_) => {
                args.glitch_count.fetch_add(1, Ordering::Relaxed);
                break;
            }
        };

        let available = out_buffer.saturating_sub(padding);
        if available > 0 {
            let out_samples = available as usize * out_ch_usize;
            if render_out.len() < out_samples {
                render_out.resize(out_samples, 0.0);
            }

            let mut peak: f32 = 0.0;
            let mut sum_sq: f32 = 0.0;

            for frame in 0..available as usize {
                ring.pop_interleaved(&mut in_frame);

                for c in 0..out_ch_usize {
                    let raw = sample_for_output_channel(&in_frame, in_ch, c, out_ch_usize);
                    let processed = dsp_pipeline.process_routing_sample(raw, c);
                    render_out[frame * out_ch_usize + c] = processed;
                    let abs = processed.abs();
                    if abs > peak {
                        peak = abs;
                    }
                    sum_sq += processed * processed;
                }
            }

            let rms = if out_samples > 0 {
                (sum_sq / out_samples as f32).sqrt()
            } else {
                0.0
            };
            args.peak_bits.store(peak.to_bits(), Ordering::Relaxed);
            args.rms_bits.store(rms.to_bits(), Ordering::Relaxed);

            let data_ptr = match unsafe { render_client.GetBuffer(available) } {
                Ok(p) => p,
                Err(_) => {
                    args.glitch_count.fetch_add(1, Ordering::Relaxed);
                    break;
                }
            };

            if out_float {
                let slice =
                    unsafe { std::slice::from_raw_parts_mut(data_ptr as *mut f32, out_samples) };
                slice.copy_from_slice(&render_out[..out_samples]);
            } else if out_bits == 16 {
                let slice =
                    unsafe { std::slice::from_raw_parts_mut(data_ptr as *mut i16, out_samples) };
                for (i, &s) in render_out[..out_samples].iter().enumerate() {
                    slice[i] = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
                }
            }

            if unsafe { render_client.ReleaseBuffer(available, 0) }.is_err() {
                args.glitch_count.fetch_add(1, Ordering::Relaxed);
                break;
            }
        }

        args.underrun_count
            .store(ring.underrun_count() as u32, Ordering::Relaxed);
        args.overrun_count
            .store(ring.overrun_count() as u32, Ordering::Relaxed);
        args.ring_fill_bits
            .store(ring.fill_percent().to_bits(), Ordering::Relaxed);

        std::thread::sleep(half_period);
    }

    let _ = unsafe { capture_client_iface.Stop() };
    let _ = unsafe { render_client_iface.Stop() };
    let _ = unsafe { capture_client_iface.Reset() };
    let _ = unsafe { render_client_iface.Reset() };
    dsp_pipeline.deactivate();

    {
        let mut s = args
            .shared_status
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        if s.state == RoutingState::Running || s.state == RoutingState::Stopping {
            s.state = RoutingState::Stopped;
        }
        s.updated_at = chrono::Utc::now().to_rfc3339();
    }

    if should_uninit {
        unsafe { CoUninitialize() };
    }

    args.done_flag.store(true, Ordering::Release);
}

#[cfg(windows)]
fn open_device(
    enumerator: &windows::Win32::Media::Audio::IMMDeviceEnumerator,
    device_id: &str,
) -> Result<windows::Win32::Media::Audio::IMMDevice, String> {
    use windows::core::HSTRING;

    if device_id.is_empty() {
        return Err("Device id is empty.".to_string());
    }
    let hid = HSTRING::from(device_id);
    match unsafe { enumerator.GetDevice(&hid) } {
        Ok(d) => Ok(d),
        Err(e) => Err(format!("Device not found: {e}")),
    }
}

#[cfg(windows)]
unsafe fn read_wfx_info(fmt: *mut windows::Win32::Media::Audio::WAVEFORMATEX) -> (u32, u16, u16, bool) {
    const WAVE_FORMAT_PCM: u16 = 1;
    const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
    const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;
    const SUBTYPE_IEEE_FLOAT: windows::core::GUID = windows::core::GUID::from_values(
        0x00000003,
        0x0000,
        0x0010,
        [0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71],
    );

    let wfx = &*fmt;
    let sample_rate = wfx.nSamplesPerSec;
    let channels = wfx.nChannels;
    let bits = wfx.wBitsPerSample;
    let is_float = if wfx.wFormatTag == WAVE_FORMAT_IEEE_FLOAT {
        true
    } else if wfx.wFormatTag == WAVE_FORMAT_EXTENSIBLE {
        let ext_ptr = fmt as *const windows::Win32::Media::Audio::WAVEFORMATEXTENSIBLE;
        let sub_format = std::ptr::read_unaligned(std::ptr::addr_of!((*ext_ptr).SubFormat));
        sub_format == SUBTYPE_IEEE_FLOAT
    } else {
        false
    };
    (sample_rate, channels, bits, is_float)
}

fn half_buffer_period(buffer_frames: u32, sample_rate: u32) -> std::time::Duration {
    let ms = if sample_rate > 0 {
        (buffer_frames as u64 * 500) / sample_rate as u64
    } else {
        10
    };
    std::time::Duration::from_millis(ms.max(1))
}

fn write_error(shared: &Arc<Mutex<AudioRoutingRuntimeStatus>>, msg: &str) {
    if let Ok(mut s) = shared.lock() {
        s.state = RoutingState::Error;
        s.last_error = Some(msg.to_string());
        s.updated_at = chrono::Utc::now().to_rfc3339();
    }
}
