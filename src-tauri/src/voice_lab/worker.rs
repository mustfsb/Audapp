use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::audio_bridge::resampler::LinearResampler;
use super::processing::VoiceChain;
use super::types::{VoiceLabSettings, VoiceLabState, VoiceLabStatus};

pub struct VoiceWorkerArgs {
    pub stop_flag: Arc<AtomicBool>,
    pub done_flag: Arc<AtomicBool>,
    pub shared_status: Arc<Mutex<VoiceLabStatus>>,
    pub shared_settings: Arc<Mutex<VoiceLabSettings>>,
}

pub fn run_voice_worker(args: VoiceWorkerArgs) {
    #[cfg(windows)]
    {
        run_voice_worker_windows(args);
        return;
    }
    #[cfg(not(windows))]
    {
        if let Ok(mut s) = args.shared_status.lock() {
            s.state = VoiceLabState::Error;
            s.running = false;
            s.last_error = Some("Voice lab requires Windows.".to_string());
            s.updated_at = chrono::Utc::now().to_rfc3339();
        }
        args.done_flag.store(true, Ordering::Release);
    }
}

fn set_error(shared: &Arc<Mutex<VoiceLabStatus>>, msg: String) {
    if let Ok(mut s) = shared.lock() {
        s.state = VoiceLabState::Error;
        s.running = false;
        s.last_error = Some(msg);
        s.updated_at = chrono::Utc::now().to_rfc3339();
    }
}

// ---- Windows constants ----

#[cfg(windows)]
const AUDCLNT_BUFFERFLAGS_SILENT: u32 = 0x00000002;
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
const SUBTYPE_PCM: windows::core::GUID = windows::core::GUID::from_values(
    0x00000001,
    0x0000,
    0x0010,
    [0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71],
);
#[cfg(windows)]
const BUFFER_100NS: i64 = 1_000_000; // 100 ms in 100ns units

#[cfg(windows)]
const TARGET_BUFFER_MS: u64 = 50;
#[cfg(windows)]
const MAX_BUFFER_MS: u64 = 200;

// ---- Windows implementation ----

#[cfg(windows)]
fn run_voice_worker_windows(args: VoiceWorkerArgs) {
    use windows::core::HRESULT;
    use windows::Win32::Media::Audio::{
        eCapture, IAudioClient, IAudioRenderClient, IMMDevice,
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

    // Read initial settings snapshot
    let init_settings = {
        args.shared_settings
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
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
                if should_uninit { unsafe { CoUninitialize() }; }
                return;
            }
        };

    // Open input device (physical capture)
    let input_dev: Option<IMMDevice> = if let Some(ref id) = init_settings.input_device_id {
        open_by_id(&enumerator, id)
    } else {
        // No device selected — use default capture
        use windows::Win32::Media::Audio::{eMultimedia};
        unsafe { enumerator.GetDefaultAudioEndpoint(eCapture, eMultimedia).ok() }
    };

    let input_dev = match input_dev {
        Some(d) => d,
        None => {
            set_error(
                &args.shared_status,
                "No capture device found. Connect a microphone.".to_string(),
            );
            args.done_flag.store(true, Ordering::Release);
            if should_uninit { unsafe { CoUninitialize() }; }
            return;
        }
    };

    // Open capture client
    let cap = match open_capture(&input_dev) {
        Ok(v) => v,
        Err(e) => {
            set_error(&args.shared_status, format!("Capture open failed: {e}"));
            args.done_flag.store(true, Ordering::Release);
            if should_uninit { unsafe { CoUninitialize() }; }
            return;
        }
    };

    {
        let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
        let fmt_kind = if cap.is_float {
            "float32".to_string()
        } else {
            format!("pcm{}bit", cap.bits)
        };
        s.input_format = Some(format!("{}Hz {}ch {}", cap.rate, cap.channels, fmt_kind));
    }

    // Open monitor output device (if enabled)
    struct MonitorStream {
        client: IAudioClient,
        render: IAudioRenderClient,
        buffer_size: u32,
        out_channels: usize,
        out_rate: u32,
    }

    let mut monitor: Option<MonitorStream> = None;
    let mut monitor_resampler: Option<LinearResampler> = None;

    if init_settings.monitor_enabled {
        let mon_dev: Option<IMMDevice> = if let Some(ref id) = init_settings.monitor_device_id {
            open_by_id(&enumerator, id)
        } else {
            find_non_audapp_default(&enumerator)
        };

        if let Some(dev) = mon_dev {
            match open_monitor_render(&dev) {
                Err(e) => {
                    if let Ok(mut s) = args.shared_status.lock() {
                        s.last_error = Some(format!("Monitor output open failed: {e}"));
                    }
                }
                Ok((client, render_client, buffer_size, out_channels, out_rate)) => {
                    if let Ok(mut s) = args.shared_status.lock() {
                        let fmt = format!("{}Hz {}ch float32", out_rate, out_channels);
                        s.monitor_output_format = Some(fmt);
                    }
                    // Create resampler if rates differ
                    if out_rate != cap.rate {
                        monitor_resampler = Some(LinearResampler::new(cap.rate, out_rate, cap.channels));
                    }
                    monitor = Some(MonitorStream {
                        client,
                        render: render_client,
                        buffer_size,
                        out_channels,
                        out_rate,
                    });
                }
            }
        } else {
            if let Ok(mut s) = args.shared_status.lock() {
                s.last_error = Some("No monitor output device found.".to_string());
            }
        }
    }

    // Start streams
    let cap_started = match unsafe { cap.client.Start() } {
        Ok(()) => true,
        Err(e) => {
            set_error(&args.shared_status, format!("Capture start failed: {e}"));
            if should_uninit { unsafe { CoUninitialize() }; }
            args.done_flag.store(true, Ordering::Release);
            return;
        }
    };
    let _ = cap_started;

    let mon_out_rate = monitor.as_ref().map_or(48000u32, |m| m.out_rate);
    let _mon_buf_size = monitor.as_ref().map_or(0u32, |m| m.buffer_size);

    // Prime monitor buffer
    if let Some(ref ms) = monitor {
        match unsafe { ms.client.Start() } {
            Ok(()) => {
                let prime = (ms.buffer_size / 2) as usize;
                if prime > 0 {
                    if let Ok(buf_ptr) = unsafe { ms.render.GetBuffer(prime as u32) } {
                        let sl = unsafe {
                            std::slice::from_raw_parts_mut(buf_ptr as *mut f32, prime * ms.out_channels)
                        };
                        sl.fill(0.0);
                        let _ = unsafe { ms.render.ReleaseBuffer(prime as u32, 0) };
                    }
                }
            }
            Err(e) => {
                if let Ok(mut s) = args.shared_status.lock() {
                    s.last_error = Some(format!("Monitor start failed: {e}"));
                }
            }
        }
    }

    // Mark as running
    {
        let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
        s.state = VoiceLabState::Running;
        s.running = true;
        s.updated_at = chrono::Utc::now().to_rfc3339();
    }

    // Build initial processing chain
    let mut chain = VoiceChain::new(cap.rate as f32, cap.channels, &init_settings);

    // Monitor ring buffer
    let src_ch = cap.channels.max(1);
    let mon_target_samples =
        ((TARGET_BUFFER_MS as f64 / 1000.0) * mon_out_rate as f64) as usize * src_ch;
    let mon_max_samples =
        ((MAX_BUFFER_MS as f64 / 1000.0) * mon_out_rate as f64) as usize * src_ch;
    let buf_cap = mon_max_samples + 16384;
    let mut mon_buf: Vec<f32> = Vec::with_capacity(buf_cap);
    let mut mon_read: usize = 0;

    // Per-window metrics (reset each status update)
    let mut raw_peak: f32 = 0.0;
    let mut raw_sum_sq: f64 = 0.0;
    let mut raw_count: u64 = 0;
    let mut proc_peak: f32 = 0.0;
    let mut proc_sum_sq: f64 = 0.0;
    let mut proc_count: u64 = 0;

    let mut render_padding_last: u32 = 0;
    let mut iter: u64 = 0;

    // i16 conversion scratch buffer
    let mut f32_scratch: Vec<f32> = Vec::new();

    // ---- Main poll loop ----
    loop {
        if args.stop_flag.load(Ordering::Relaxed) {
            break;
        }

        // Refresh chain settings every 50 iterations
        if iter % 50 == 0 && iter > 0 {
            let s = args.shared_settings.lock().unwrap_or_else(|p| p.into_inner()).clone();
            chain.update(&s);
        }

        // ---- Read capture packets ----
        loop {
            let next = match unsafe { cap.capture.GetNextPacketSize() } {
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
                cap.capture.GetBuffer(&mut data_ptr, &mut frames, &mut flags, None, None)
            }
            .is_err()
            {
                break;
            }

            if frames > 0 {
                let silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0;
                let samples = frames as usize * cap.channels;

                // Convert packet to &[f32]
                let f32_slice: &[f32] = if silent || data_ptr.is_null() {
                    f32_scratch.resize(samples, 0.0);
                    &f32_scratch[..samples]
                } else if cap.is_float {
                    unsafe { std::slice::from_raw_parts(data_ptr as *const f32, samples) }
                } else if cap.bits == 16 {
                    // i16 → f32
                    f32_scratch.resize(samples, 0.0);
                    let i16s = unsafe {
                        std::slice::from_raw_parts(data_ptr as *const i16, samples)
                    };
                    for (i, &v) in i16s.iter().enumerate() {
                        f32_scratch[i] = v as f32 / 32768.0;
                    }
                    &f32_scratch[..samples]
                } else {
                    // Unsupported format — treat as silence
                    f32_scratch.resize(samples, 0.0);
                    &f32_scratch[..samples]
                };

                // Process samples
                let mut processed_frame: Vec<f32> = Vec::with_capacity(samples);
                for (i, &samp) in f32_slice.iter().enumerate() {
                    let ch = i % cap.channels;
                    let abs = samp.abs();
                    if abs > raw_peak { raw_peak = abs; }
                    raw_sum_sq += (samp as f64) * (samp as f64);
                    raw_count += 1;

                    let p = chain.process(samp, ch);
                    let pabs = p.abs();
                    if pabs > proc_peak { proc_peak = pabs; }
                    proc_sum_sq += (p as f64) * (p as f64);
                    proc_count += 1;

                    processed_frame.push(p);
                }

                // Push to monitor buffer
                if monitor.is_some() {
                    let avail = mon_buf.len() - mon_read;
                    let to_add: &[f32] = if let Some(ref mut rs) = monitor_resampler {
                        let resampled = rs.resample(&processed_frame);
                        // Avoid borrow issue: push resampled directly
                        let n = resampled.len();
                        if avail + n > mon_max_samples {
                            let trim = (avail + n).saturating_sub(mon_target_samples);
                            mon_read = (mon_read + trim).min(mon_buf.len());
                        }
                        if mon_read > mon_buf.capacity() / 2 {
                            mon_buf.drain(..mon_read);
                            mon_read = 0;
                        }
                        mon_buf.extend_from_slice(&resampled);
                        &[] // already pushed
                    } else {
                        &processed_frame[..]
                    };

                    if !to_add.is_empty() {
                        if avail + to_add.len() > mon_max_samples {
                            let trim = (avail + to_add.len()).saturating_sub(mon_target_samples);
                            mon_read = (mon_read + trim).min(mon_buf.len());
                        }
                        if mon_read > mon_buf.capacity() / 2 {
                            mon_buf.drain(..mon_read);
                            mon_read = 0;
                        }
                        mon_buf.extend_from_slice(to_add);
                    }
                }
            }

            let _ = unsafe { cap.capture.ReleaseBuffer(frames) };
        }

        // ---- Write to monitor output ----
        let mut render_padding = render_padding_last;
        if let Some(ref ms) = monitor {
            let padding = unsafe { ms.client.GetCurrentPadding() }.unwrap_or(ms.buffer_size);
            render_padding = padding;
            render_padding_last = padding;
            let avail_frames = ms.buffer_size.saturating_sub(padding) as usize;

            if avail_frames > 0 {
                let buf_avail = mon_buf.len() - mon_read;
                let have_frames = buf_avail / src_ch;
                let write_frames = avail_frames.min(have_frames);

                if write_frames > 0 {
                    let src_start = mon_read;
                    let src_end = mon_read + write_frames * src_ch;
                    match unsafe { ms.render.GetBuffer(write_frames as u32) } {
                        Ok(buf_ptr) => {
                            let out_samples = write_frames * ms.out_channels;
                            let out = unsafe {
                                std::slice::from_raw_parts_mut(buf_ptr as *mut f32, out_samples)
                            };
                            mix_channels(
                                &mon_buf[src_start..src_end],
                                src_ch,
                                out,
                                ms.out_channels,
                                write_frames,
                            );
                            mon_read += write_frames * src_ch;
                            if mon_read > mon_buf.capacity() / 2 {
                                mon_buf.drain(..mon_read);
                                mon_read = 0;
                            }
                            let _ = unsafe { ms.render.ReleaseBuffer(write_frames as u32, 0) };
                        }
                        Err(_) => {}
                    }
                }
            }
        }
        let _ = render_padding;

        // ---- Update status every 50 iterations ----
        iter += 1;
        if iter % 50 == 0 {
            let raw_rms = if raw_count > 0 {
                (raw_sum_sq / raw_count as f64).sqrt() as f32
            } else {
                0.0
            };
            let proc_rms = if proc_count > 0 {
                (proc_sum_sq / proc_count as f64).sqrt() as f32
            } else {
                0.0
            };
            let gate_open = chain.gate_open();

            if let Ok(mut s) = args.shared_status.lock() {
                s.raw_peak = raw_peak;
                s.raw_rms = raw_rms;
                s.processed_peak = proc_peak;
                s.processed_rms = proc_rms;
                s.gate_open = gate_open;
                s.updated_at = chrono::Utc::now().to_rfc3339();
            }

            // Reset windowed metrics for next interval
            raw_peak = 0.0;
            raw_sum_sq = 0.0;
            raw_count = 0;
            proc_peak = 0.0;
            proc_sum_sq = 0.0;
            proc_count = 0;
        }

        let sleep_ms: u64 = if monitor.is_some() { 5 } else { 8 };
        std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
    }

    // ---- Stop streams ----
    let _ = unsafe { cap.client.Stop() };
    if let Some(ref ms) = monitor {
        let _ = unsafe { ms.client.Stop() };
    }

    {
        let mut s = args.shared_status.lock().unwrap_or_else(|p| p.into_inner());
        s.state = VoiceLabState::Stopped;
        s.running = false;
        s.raw_peak = 0.0;
        s.raw_rms = 0.0;
        s.processed_peak = 0.0;
        s.processed_rms = 0.0;
        s.updated_at = chrono::Utc::now().to_rfc3339();
    }

    if should_uninit {
        unsafe { CoUninitialize() };
    }
    args.done_flag.store(true, Ordering::Release);
}

// ---- WASAPI helpers ----

#[cfg(windows)]
struct CaptureStreamInner {
    client: windows::Win32::Media::Audio::IAudioClient,
    capture: windows::Win32::Media::Audio::IAudioCaptureClient,
    channels: usize,
    rate: u32,
    is_float: bool,
    bits: u16,
}

#[cfg(windows)]
fn open_capture(
    device: &windows::Win32::Media::Audio::IMMDevice,
) -> Result<CaptureStreamInner, String> {
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

    let (rate, channels, is_float, bits) = unsafe { parse_wfx(fmt_ptr) };

    if !is_float && bits != 16 {
        unsafe { CoTaskMemFree(Some(fmt_ptr as *const _ as _)) };
        return Err(format!(
            "Unsupported capture format: not float32 or int16 (bits={}). Cannot process.",
            bits
        ));
    }

    let r = unsafe {
        client.Initialize(AUDCLNT_SHAREMODE_SHARED, 0, BUFFER_100NS, 0, fmt_ptr, None)
    };
    unsafe { CoTaskMemFree(Some(fmt_ptr as *const _ as _)) };
    r.map_err(|e| format!("Initialize (capture) failed: {e}"))?;

    let capture: IAudioCaptureClient = unsafe { client.GetService::<IAudioCaptureClient>() }
        .map_err(|e| format!("GetService (capture) failed: {e}"))?;

    Ok(CaptureStreamInner { client, capture, channels, rate, is_float, bits })
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

    let (rate, channels, is_float, _bits) = unsafe { parse_wfx(fmt_ptr) };

    if !is_float {
        unsafe { CoTaskMemFree(Some(fmt_ptr as *const _ as _)) };
        return Err("Monitor output is not float32; cannot write processed mic audio.".to_string());
    }

    let r = unsafe {
        client.Initialize(AUDCLNT_SHAREMODE_SHARED, 0, BUFFER_100NS, 0, fmt_ptr, None)
    };
    unsafe { CoTaskMemFree(Some(fmt_ptr as *const _ as _)) };
    r.map_err(|e| format!("Initialize (monitor render) failed: {e}"))?;

    let buffer_size =
        unsafe { client.GetBufferSize() }.map_err(|e| format!("GetBufferSize failed: {e}"))?;

    let render_client: IAudioRenderClient = unsafe { client.GetService::<IAudioRenderClient>() }
        .map_err(|e| format!("GetService (render) failed: {e}"))?;

    Ok((client, render_client, buffer_size, channels, rate))
}

#[cfg(windows)]
unsafe fn parse_wfx(
    fmt: *mut windows::Win32::Media::Audio::WAVEFORMATEX,
) -> (u32, usize, bool, u16) {
    use windows::Win32::Media::Audio::WAVEFORMATEXTENSIBLE;
    let wfx = &*fmt;
    let rate = wfx.nSamplesPerSec;
    let channels = wfx.nChannels as usize;
    let bits = wfx.wBitsPerSample;
    let is_float = match wfx.wFormatTag {
        WAVE_FORMAT_IEEE_FLOAT => true,
        WAVE_FORMAT_EXTENSIBLE => {
            let ext = fmt as *const WAVEFORMATEXTENSIBLE;
            let sub = std::ptr::read_unaligned(std::ptr::addr_of!((*ext).SubFormat));
            sub == SUBTYPE_IEEE_FLOAT
        }
        WAVE_FORMAT_PCM => false,
        _ => {
            // Check extensible PCM
            if wfx.wFormatTag == WAVE_FORMAT_EXTENSIBLE {
                let ext = fmt as *const WAVEFORMATEXTENSIBLE;
                let sub = std::ptr::read_unaligned(std::ptr::addr_of!((*ext).SubFormat));
                sub == SUBTYPE_PCM
            } else {
                false
            }
        }
    };
    (rate, channels, is_float, bits)
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
fn find_non_audapp_default(
    enumerator: &windows::Win32::Media::Audio::IMMDeviceEnumerator,
) -> Option<windows::Win32::Media::Audio::IMMDevice> {
    use windows::Win32::Media::Audio::{eMultimedia, eRender, DEVICE_STATE_ACTIVE};

    // Try default first
    let default_dev = unsafe {
        enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .ok()?
    };
    let default_name = get_friendly_name(&default_dev).to_lowercase();
    if !default_name.contains("audapp") {
        return Some(default_dev);
    }

    // Default is Audapp; find another active render endpoint
    let col = unsafe {
        enumerator
            .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
            .ok()?
    };
    let count = unsafe { col.GetCount().ok()? };
    for i in 0..count {
        if let Ok(dev) = unsafe { col.Item(i) } {
            if !get_friendly_name(&dev).to_lowercase().contains("audapp") {
                return Some(dev);
            }
        }
    }
    None
}

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
        while *pwstr.0.add(len) != 0 { len += 1; }
        let name = String::from_utf16_lossy(std::slice::from_raw_parts(pwstr.0, len));
        CoTaskMemFree(Some(pwstr.0 as _));
        name
    }
}

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

// Public helpers for the manager's device listing

pub fn list_capture_devices() -> Result<Vec<super::types::VoiceDevice>, String> {
    #[cfg(windows)]
    return list_capture_devices_windows();
    #[cfg(not(windows))]
    Err("Voice lab requires Windows.".to_string())
}

pub fn list_render_devices() -> Result<Vec<super::types::VoiceDevice>, String> {
    #[cfg(windows)]
    return list_render_devices_windows();
    #[cfg(not(windows))]
    Err("Voice lab requires Windows.".to_string())
}

#[cfg(windows)]
fn list_capture_devices_windows() -> Result<Vec<super::types::VoiceDevice>, String> {
    use windows::core::HRESULT;
    use windows::Win32::Media::Audio::{
        eCapture, eMultimedia, IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106u32 as i32);

    let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let should_uninit = hr.is_ok() || hr == RPC_E_CHANGED_MODE;
    if !hr.is_ok() && hr != RPC_E_CHANGED_MODE {
        return Err(format!("COM init failed: {hr}"));
    }

    let result = (|| {
        let enumerator: IMMDeviceEnumerator =
            unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
                .map_err(|e| format!("IMMDeviceEnumerator: {e}"))?;

        let default_id: Option<String> = unsafe {
            enumerator
                .GetDefaultAudioEndpoint(eCapture, eMultimedia)
                .ok()
        }
        .and_then(|d| get_device_id_str(&d));

        let col =
            unsafe { enumerator.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE) }
                .map_err(|e| format!("EnumAudioEndpoints: {e}"))?;

        let count = unsafe { col.GetCount() }.unwrap_or(0);
        let mut devices = Vec::new();

        for i in 0..count {
            if let Ok(dev) = unsafe { col.Item(i) } {
                if let Some(id) = get_device_id_str(&dev) {
                    let name = get_friendly_name(&dev);
                    let is_default = default_id.as_deref().is_some_and(|d| d == id);
                    devices.push(super::types::VoiceDevice { id, name, is_default });
                }
            }
        }

        Ok(devices)
    })();

    if should_uninit {
        unsafe { CoUninitialize() };
    }

    result
}

#[cfg(windows)]
fn list_render_devices_windows() -> Result<Vec<super::types::VoiceDevice>, String> {
    use windows::core::HRESULT;
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106u32 as i32);

    let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let should_uninit = hr.is_ok() || hr == RPC_E_CHANGED_MODE;
    if !hr.is_ok() && hr != RPC_E_CHANGED_MODE {
        return Err(format!("COM init failed: {hr}"));
    }

    let result = (|| {
        let enumerator: IMMDeviceEnumerator =
            unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
                .map_err(|e| format!("IMMDeviceEnumerator: {e}"))?;

        let default_id: Option<String> = unsafe {
            enumerator
                .GetDefaultAudioEndpoint(eRender, eMultimedia)
                .ok()
        }
        .and_then(|d| get_device_id_str(&d));

        let col =
            unsafe { enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) }
                .map_err(|e| format!("EnumAudioEndpoints: {e}"))?;

        let count = unsafe { col.GetCount() }.unwrap_or(0);
        let mut devices = Vec::new();

        for i in 0..count {
            if let Ok(dev) = unsafe { col.Item(i) } {
                if let Some(id) = get_device_id_str(&dev) {
                    let name = get_friendly_name(&dev);
                    // Exclude Audapp endpoints from monitor output list
                    if name.to_lowercase().contains("audapp") {
                        continue;
                    }
                    let is_default = default_id.as_deref().is_some_and(|d| d == id);
                    devices.push(super::types::VoiceDevice { id, name, is_default });
                }
            }
        }

        Ok(devices)
    })();

    if should_uninit {
        unsafe { CoUninitialize() };
    }

    result
}

#[cfg(windows)]
fn get_device_id_str(device: &windows::Win32::Media::Audio::IMMDevice) -> Option<String> {
    use windows::Win32::System::Com::CoTaskMemFree;
    unsafe {
        let pwstr = device.GetId().ok()?;
        if pwstr.is_null() {
            return None;
        }
        let mut len = 0usize;
        while *pwstr.0.add(len) != 0 { len += 1; }
        let s = String::from_utf16_lossy(std::slice::from_raw_parts(pwstr.0, len));
        CoTaskMemFree(Some(pwstr.0 as _));
        Some(s)
    }
}
