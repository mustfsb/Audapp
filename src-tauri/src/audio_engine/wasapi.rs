use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use crate::audio_engine::dsp::DspPipeline;
use crate::audio_engine::metrics::estimated_latency_ms;
use crate::audio_engine::tone::ToneGenerator;
use crate::audio_engine::types::{AudioEngineRuntimeStatus, EngineMode, EngineState};

const WAVE_FORMAT_PCM: u16 = 1;
const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;
const BUFFER_DURATION_100NS: i64 = 200_000; // 20 ms
const BUFFER_FLAG_SILENT: u32 = 2; // AUDCLNT_BUFFERFLAGS_SILENT

#[cfg(windows)]
use windows::core::HSTRING;
#[cfg(windows)]
use windows::Win32::Media::Audio::{
    eCapture, eMultimedia, eRender, IAudioCaptureClient, IAudioClient, IAudioRenderClient,
    IMMDeviceEnumerator, MMDeviceEnumerator, AUDCLNT_SHAREMODE_SHARED,
    WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
};
#[cfg(windows)]
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    COINIT_MULTITHREADED,
};

#[cfg(windows)]
const SUBTYPE_IEEE_FLOAT: windows::core::GUID = windows::core::GUID::from_values(
    0x00000003,
    0x0000,
    0x0010,
    [0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71],
);

pub struct WorkerArgs {
    pub mode: EngineMode,
    pub output_device_id: Option<String>,
    pub input_device_id: Option<String>,
    pub tone_frequency_hz: f32,
    pub tone_gain: f32,
    pub stop_flag: Arc<AtomicBool>,
    pub done_flag: Arc<AtomicBool>,
    pub peak_bits: Arc<AtomicU32>,
    pub rms_bits: Arc<AtomicU32>,
    pub glitch_count: Arc<AtomicU32>,
    pub shared_status: Arc<Mutex<AudioEngineRuntimeStatus>>,
}

pub fn run_worker(args: WorkerArgs) {
    #[cfg(windows)]
    {
        run_worker_windows(args);
        return;
    }

    #[cfg(not(windows))]
    {
        write_error(&args.shared_status, "Audio engine requires Windows.");
        args.done_flag.store(true, Ordering::Release);
    }
}

#[cfg(windows)]
fn run_worker_windows(args: WorkerArgs) {
    use windows::core::HRESULT;
    const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106u32 as i32);

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

    run_wasapi_stream(
        &args.mode,
        args.output_device_id.as_deref(),
        args.input_device_id.as_deref(),
        args.tone_frequency_hz,
        args.tone_gain,
        &args.stop_flag,
        &args.peak_bits,
        &args.rms_bits,
        &args.glitch_count,
        &args.shared_status,
    );

    if should_uninit {
        unsafe { CoUninitialize() };
    }

    args.done_flag.store(true, Ordering::Release);
}

#[cfg(windows)]
fn run_wasapi_stream(
    mode: &EngineMode,
    output_device_id: Option<&str>,
    input_device_id: Option<&str>,
    tone_frequency_hz: f32,
    tone_gain: f32,
    stop_flag: &Arc<AtomicBool>,
    peak_bits: &Arc<AtomicU32>,
    rms_bits: &Arc<AtomicU32>,
    glitch_count: &Arc<AtomicU32>,
    shared_status: &Arc<Mutex<AudioEngineRuntimeStatus>>,
) {
    let is_capture = matches!(mode, EngineMode::CaptureMeter | EngineMode::CaptureToNull);
    let device_id = if is_capture { input_device_id } else { output_device_id };

    let Ok(enumerator) = (unsafe {
        CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
    }) else {
        write_error(shared_status, "Failed to create device enumerator.");
        return;
    };

    let device = if let Some(id) = device_id {
        let hid = HSTRING::from(id);
        match unsafe { enumerator.GetDevice(&hid) } {
            Ok(d) => d,
            Err(e) => {
                write_error(shared_status, &format!("Device not found: {e}"));
                return;
            }
        }
    } else {
        let flow = if is_capture { eCapture } else { eRender };
        match unsafe { enumerator.GetDefaultAudioEndpoint(flow, eMultimedia) } {
            Ok(d) => d,
            Err(e) => {
                write_error(shared_status, &format!("No default device: {e}"));
                return;
            }
        }
    };

    let Ok(audio_client) = (unsafe { device.Activate::<IAudioClient>(CLSCTX_ALL, None) }) else {
        write_error(shared_status, "Failed to activate audio client.");
        return;
    };

    let mix_fmt_ptr = match unsafe { audio_client.GetMixFormat() } {
        Ok(p) => p,
        Err(e) => {
            write_error(shared_status, &format!("GetMixFormat failed: {e}"));
            return;
        }
    };

    if mix_fmt_ptr.is_null() {
        write_error(shared_status, "GetMixFormat returned null.");
        return;
    }

    let (sample_rate, channels, bits_per_sample, is_float) =
        unsafe { read_wfx_info(mix_fmt_ptr) };

    let init_result = unsafe {
        audio_client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            0,
            BUFFER_DURATION_100NS,
            0,
            mix_fmt_ptr,
            None,
        )
    };

    unsafe { CoTaskMemFree(Some(mix_fmt_ptr as *const _ as _)) };

    if let Err(e) = init_result {
        write_error(shared_status, &format!("IAudioClient::Initialize failed: {e}"));
        return;
    }

    let buffer_size = match unsafe { audio_client.GetBufferSize() } {
        Ok(s) => s,
        Err(e) => {
            write_error(shared_status, &format!("GetBufferSize failed: {e}"));
            return;
        }
    };

    let latency_ms = estimated_latency_ms(buffer_size, sample_rate);

    {
        let mut s = shared_status.lock().unwrap_or_else(|p| p.into_inner());
        s.state = EngineState::Running;
        s.sample_rate = Some(sample_rate);
        s.channels = Some(channels);
        s.bits_per_sample = Some(bits_per_sample);
        s.buffer_frames = Some(buffer_size);
        s.estimated_latency_ms = Some(latency_ms);
        s.updated_at = chrono::Utc::now().to_rfc3339();
    }

    let dsp_shared = crate::audio_engine::dsp::config::global();
    let mut dsp_pipeline = DspPipeline::new();
    dsp_pipeline.prepare(sample_rate as f32, channels as usize, dsp_shared, is_float, bits_per_sample);

    if is_capture {
        run_capture_loop(
            &audio_client,
            channels,
            bits_per_sample,
            is_float,
            buffer_size,
            sample_rate,
            stop_flag,
            peak_bits,
            rms_bits,
            glitch_count,
            shared_status,
            &mut dsp_pipeline,
        );
    } else {
        run_render_loop(
            &audio_client,
            mode,
            channels,
            bits_per_sample,
            is_float,
            buffer_size,
            sample_rate,
            tone_frequency_hz,
            tone_gain,
            stop_flag,
            glitch_count,
            shared_status,
            &mut dsp_pipeline,
        );
    }

    let _ = unsafe { audio_client.Stop() };
    let _ = unsafe { audio_client.Reset() };
    dsp_pipeline.deactivate();

    {
        let mut s = shared_status.lock().unwrap_or_else(|p| p.into_inner());
        if s.state == EngineState::Stopping || s.state == EngineState::Running {
            s.state = EngineState::Stopped;
        }
        s.updated_at = chrono::Utc::now().to_rfc3339();
    }
}

#[cfg(windows)]
fn run_render_loop(
    audio_client: &IAudioClient,
    mode: &EngineMode,
    channels: u16,
    bits_per_sample: u16,
    is_float: bool,
    buffer_size: u32,
    sample_rate: u32,
    tone_frequency_hz: f32,
    tone_gain: f32,
    stop_flag: &Arc<AtomicBool>,
    glitch_count: &Arc<AtomicU32>,
    shared_status: &Arc<Mutex<AudioEngineRuntimeStatus>>,
    dsp_pipeline: &mut DspPipeline,
) {
    let Ok(render_client) = (unsafe { audio_client.GetService::<IAudioRenderClient>() }) else {
        write_error(shared_status, "Failed to get render client.");
        return;
    };

    if unsafe { audio_client.Start() }.is_err() {
        write_error(shared_status, "Failed to start audio client.");
        return;
    }

    let ch = channels as usize;
    let half_period = half_buffer_period(buffer_size, sample_rate);
    let is_tone = matches!(mode, EngineMode::RenderTestTone);
    let mut tone = ToneGenerator::new(tone_frequency_hz, tone_gain, sample_rate);

    loop {
        if stop_flag.load(Ordering::Relaxed) {
            break;
        }

        // Once per buffer cycle: refresh DSP config snapshot and recompute coefficients if needed
        dsp_pipeline.maybe_refresh();

        let padding = match unsafe { audio_client.GetCurrentPadding() } {
            Ok(p) => p,
            Err(_) => {
                glitch_count.fetch_add(1, Ordering::Relaxed);
                break;
            }
        };

        let available = buffer_size.saturating_sub(padding);

        if available > 0 {
            let data_ptr = match unsafe { render_client.GetBuffer(available) } {
                Ok(p) => p,
                Err(_) => {
                    glitch_count.fetch_add(1, Ordering::Relaxed);
                    break;
                }
            };

            let flags = if !is_tone || data_ptr.is_null() {
                BUFFER_FLAG_SILENT
            } else {
                // HOT PATH: no alloc, no locks, no logging
                let total = available as usize * ch;
                if is_float {
                    let slice = unsafe {
                        std::slice::from_raw_parts_mut(data_ptr as *mut f32, total)
                    };
                    for frame in 0..available as usize {
                        // Apply output DSP chain (gain → HPF → LPF) if enabled
                        let s = dsp_pipeline.process_render_mono(tone.next_sample());
                        for c in 0..ch {
                            slice[frame * ch + c] = s;
                        }
                    }
                } else if bits_per_sample == 16 {
                    let slice = unsafe {
                        std::slice::from_raw_parts_mut(data_ptr as *mut i16, total)
                    };
                    for frame in 0..available as usize {
                        let s = (tone.next_sample() * 32767.0) as i16;
                        for c in 0..ch {
                            slice[frame * ch + c] = s;
                        }
                    }
                } else {
                    // Unsupported format: write silence
                    let byte_count = available as usize * ch * (bits_per_sample as usize / 8);
                    let slice = unsafe {
                        std::slice::from_raw_parts_mut(data_ptr, byte_count)
                    };
                    for b in slice.iter_mut() {
                        *b = 0;
                    }
                }
                0
            };

            if unsafe { render_client.ReleaseBuffer(available, flags) }.is_err() {
                glitch_count.fetch_add(1, Ordering::Relaxed);
                break;
            }
        }

        std::thread::sleep(half_period);
    }
}

#[cfg(windows)]
fn run_capture_loop(
    audio_client: &IAudioClient,
    channels: u16,
    bits_per_sample: u16,
    is_float: bool,
    buffer_size: u32,
    sample_rate: u32,
    stop_flag: &Arc<AtomicBool>,
    peak_bits: &Arc<AtomicU32>,
    rms_bits: &Arc<AtomicU32>,
    glitch_count: &Arc<AtomicU32>,
    shared_status: &Arc<Mutex<AudioEngineRuntimeStatus>>,
    dsp_pipeline: &mut DspPipeline,
) {
    let Ok(capture_client) = (unsafe { audio_client.GetService::<IAudioCaptureClient>() }) else {
        write_error(shared_status, "Failed to get capture client.");
        return;
    };

    if unsafe { audio_client.Start() }.is_err() {
        write_error(shared_status, "Failed to start audio client.");
        return;
    }

    let ch = channels as usize;
    let half_period = half_buffer_period(buffer_size, sample_rate);

    loop {
        if stop_flag.load(Ordering::Relaxed) {
            break;
        }

        // Once per buffer cycle: refresh DSP config snapshot and recompute coefficients if needed
        dsp_pipeline.maybe_refresh();

        loop {
            let packet_size = match unsafe { capture_client.GetNextPacketSize() } {
                Ok(s) => s,
                Err(_) => {
                    glitch_count.fetch_add(1, Ordering::Relaxed);
                    break;
                }
            };

            if packet_size == 0 {
                break;
            }

            let mut data_ptr: *mut u8 = std::ptr::null_mut();
            let mut frames_available: u32 = 0;
            let mut flags: u32 = 0;

            // HOT PATH: no alloc, no locks
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
                glitch_count.fetch_add(1, Ordering::Relaxed);
                break;
            }

            if !data_ptr.is_null() && frames_available > 0 {
                let total = frames_available as usize * ch;
                let (peak, rms_val) = if is_float {
                    // Apply input DSP chain (gain → HPF → LPF) per channel before metering
                    compute_peak_rms_f32_dsp(data_ptr, frames_available as usize, ch, dsp_pipeline)
                } else if bits_per_sample == 16 {
                    compute_peak_rms_i16(data_ptr, total)
                } else {
                    (0.0f32, 0.0f32)
                };

                peak_bits.store(peak.to_bits(), Ordering::Relaxed);
                rms_bits.store(rms_val.to_bits(), Ordering::Relaxed);
            }

            if unsafe { capture_client.ReleaseBuffer(frames_available) }.is_err() {
                glitch_count.fetch_add(1, Ordering::Relaxed);
                break;
            }
        }

        std::thread::sleep(half_period);
    }
}

#[cfg(windows)]
#[inline]
fn compute_peak_rms_f32_dsp(
    data: *mut u8,
    frames: usize,
    channels: usize,
    dsp: &mut DspPipeline,
) -> (f32, f32) {
    let total = frames * channels;
    if total == 0 {
        return (0.0, 0.0);
    }
    let slice = unsafe { std::slice::from_raw_parts(data as *const f32, total) };
    let mut peak: f32 = 0.0;
    let mut sum_sq: f32 = 0.0;
    for frame in 0..frames {
        for ch in 0..channels {
            // Apply input DSP (gain → HPF → LPF); returns sample unchanged when DSP is off
            let s = dsp.process_capture_sample(slice[frame * channels + ch], ch);
            let abs = s.abs();
            if abs > peak {
                peak = abs;
            }
            sum_sq += s * s;
        }
    }
    let rms = (sum_sq / total as f32).sqrt();
    (peak, rms)
}

#[cfg(windows)]
#[inline]
fn compute_peak_rms_i16(data: *mut u8, total_samples: usize) -> (f32, f32) {
    let slice = unsafe { std::slice::from_raw_parts(data as *const i16, total_samples) };
    let mut peak: f32 = 0.0;
    let mut sum_sq: f32 = 0.0;
    for &s in slice {
        let f = s as f32 / 32768.0;
        let abs = f.abs();
        if abs > peak {
            peak = abs;
        }
        sum_sq += f * f;
    }
    let rms = if total_samples > 0 {
        (sum_sq / total_samples as f32).sqrt()
    } else {
        0.0
    };
    (peak, rms)
}

#[cfg(windows)]
unsafe fn read_wfx_info(fmt: *mut WAVEFORMATEX) -> (u32, u16, u16, bool) {
    let wfx = &*fmt;
    let sample_rate = wfx.nSamplesPerSec;
    let channels = wfx.nChannels;
    let bits = wfx.wBitsPerSample;

    let is_float = if wfx.wFormatTag == WAVE_FORMAT_IEEE_FLOAT {
        true
    } else if wfx.wFormatTag == WAVE_FORMAT_EXTENSIBLE {
        let ext_ptr = fmt as *const WAVEFORMATEXTENSIBLE;
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

fn write_error(shared: &Arc<Mutex<AudioEngineRuntimeStatus>>, msg: &str) {
    if let Ok(mut s) = shared.lock() {
        s.state = EngineState::Error;
        s.last_error = Some(msg.to_string());
        s.updated_at = chrono::Utc::now().to_rfc3339();
    }
}
