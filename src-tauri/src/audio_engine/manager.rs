use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use crate::audio_engine::errors::EngineError;
use crate::audio_engine::metrics::estimated_latency_ms;
use crate::audio_engine::types::{
    AudioEngineRuntimeStatus, EngineMode, EngineState, StartAudioEngineTestInput,
};
use crate::audio_engine::wasapi::{run_worker, WorkerArgs};

static ENGINE: OnceLock<Mutex<EngineManager>> = OnceLock::new();

fn global() -> &'static Mutex<EngineManager> {
    ENGINE.get_or_init(|| Mutex::new(EngineManager { worker: None }))
}

struct EngineManager {
    worker: Option<WorkerState>,
}

struct WorkerState {
    stop_flag: Arc<AtomicBool>,
    done_flag: Arc<AtomicBool>,
    peak_bits: Arc<AtomicU32>,
    rms_bits: Arc<AtomicU32>,
    glitch_count: Arc<AtomicU32>,
    thread: Option<std::thread::JoinHandle<()>>,
    shared_status: Arc<Mutex<AudioEngineRuntimeStatus>>,
}

pub fn engine_start(
    input: StartAudioEngineTestInput,
) -> Result<AudioEngineRuntimeStatus, EngineError> {
    let mut manager = global()
        .lock()
        .unwrap_or_else(|p| p.into_inner());

    if manager.worker.is_some() {
        return Err(EngineError::AlreadyRunning);
    }

    if input.mode == EngineMode::None {
        return Err(EngineError::InvalidInput(
            "Mode cannot be 'none' for a test start.".to_string(),
        ));
    }

    let tone_frequency_hz = input.tone_frequency_hz.unwrap_or(440.0).clamp(20.0, 20000.0);
    let tone_gain = input.tone_gain.unwrap_or(0.1).clamp(0.001, 1.0);

    let stop_flag = Arc::new(AtomicBool::new(false));
    let done_flag = Arc::new(AtomicBool::new(false));
    let peak_bits = Arc::new(AtomicU32::new(0));
    let rms_bits = Arc::new(AtomicU32::new(0));
    let glitch_count = Arc::new(AtomicU32::new(0));

    let initial_status = AudioEngineRuntimeStatus {
        state: EngineState::Starting,
        mode: input.mode.clone(),
        input_device_id: input.input_device_id.clone(),
        output_device_id: input.output_device_id.clone(),
        updated_at: chrono::Utc::now().to_rfc3339(),
        ..Default::default()
    };

    let shared_status = Arc::new(Mutex::new(initial_status.clone()));

    let args = WorkerArgs {
        mode: input.mode,
        output_device_id: input.output_device_id,
        input_device_id: input.input_device_id,
        tone_frequency_hz,
        tone_gain,
        stop_flag: stop_flag.clone(),
        done_flag: done_flag.clone(),
        peak_bits: peak_bits.clone(),
        rms_bits: rms_bits.clone(),
        glitch_count: glitch_count.clone(),
        shared_status: shared_status.clone(),
    };

    let handle = std::thread::Builder::new()
        .name("audapp-engine-worker".to_string())
        .spawn(move || run_worker(args))
        .map_err(|e| EngineError::Platform(format!("Failed to spawn worker thread: {e}")))?;

    manager.worker = Some(WorkerState {
        stop_flag,
        done_flag,
        peak_bits,
        rms_bits,
        glitch_count,
        thread: Some(handle),
        shared_status,
    });

    Ok(initial_status)
}

pub fn engine_stop() -> AudioEngineRuntimeStatus {
    let mut manager = global()
        .lock()
        .unwrap_or_else(|p| p.into_inner());

    let Some(worker) = manager.worker.take() else {
        return stopped_status();
    };

    worker.stop_flag.store(true, Ordering::Relaxed);

    {
        if let Ok(mut s) = worker.shared_status.lock() {
            s.state = EngineState::Stopping;
            s.updated_at = chrono::Utc::now().to_rfc3339();
        }
    }

    if let Some(thread) = worker.thread {
        let _ = thread.join();
    }

    let status = {
        let mut s = worker
            .shared_status
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        if s.state == EngineState::Stopping {
            s.state = EngineState::Stopped;
        }
        s.updated_at = chrono::Utc::now().to_rfc3339();
        s.clone()
    };

    status
}

pub fn engine_status() -> AudioEngineRuntimeStatus {
    let manager = global()
        .lock()
        .unwrap_or_else(|p| p.into_inner());

    let Some(worker) = &manager.worker else {
        return stopped_status();
    };

    let mut status = worker
        .shared_status
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone();

    let peak_raw = worker.peak_bits.load(Ordering::Relaxed);
    let rms_raw = worker.rms_bits.load(Ordering::Relaxed);
    let glitches = worker.glitch_count.load(Ordering::Relaxed);

    status.peak_level = if peak_raw != 0 {
        Some(f32::from_bits(peak_raw))
    } else {
        None
    };
    status.rms_level = if rms_raw != 0 {
        Some(f32::from_bits(rms_raw))
    } else {
        None
    };
    status.glitch_count = glitches;

    if let Some(buffer_frames) = status.buffer_frames {
        if let Some(sample_rate) = status.sample_rate {
            status.estimated_latency_ms =
                Some(estimated_latency_ms(buffer_frames, sample_rate));
        }
    }

    status.updated_at = chrono::Utc::now().to_rfc3339();
    status
}

pub fn engine_shutdown() {
    let mut manager = global()
        .lock()
        .unwrap_or_else(|p| p.into_inner());

    let Some(worker) = manager.worker.take() else {
        return;
    };

    worker.stop_flag.store(true, Ordering::Relaxed);

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);

    loop {
        if worker.done_flag.load(Ordering::Relaxed) {
            break;
        }
        if std::time::Instant::now() >= deadline {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    if worker.done_flag.load(Ordering::Relaxed) {
        if let Some(thread) = worker.thread {
            let _ = thread.join();
        }
    }
}

fn stopped_status() -> AudioEngineRuntimeStatus {
    AudioEngineRuntimeStatus {
        updated_at: chrono::Utc::now().to_rfc3339(),
        ..Default::default()
    }
}
