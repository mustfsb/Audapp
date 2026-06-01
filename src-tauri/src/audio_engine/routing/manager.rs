use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use crate::audio_engine::manager::engine_is_active;
use crate::audio_engine::routing::duplex::{run_duplex_worker, DuplexWorkerArgs};
use crate::audio_engine::routing::safety::run_safety_checks;
use crate::audio_engine::routing::types::{
    AudioRoutingRuntimeStatus, RoutingConfigInput, RoutingError, RoutingState,
};

static ROUTING: OnceLock<Mutex<RoutingManager>> = OnceLock::new();

fn global() -> &'static Mutex<RoutingManager> {
    ROUTING.get_or_init(|| Mutex::new(RoutingManager { worker: None }))
}

struct RoutingManager {
    worker: Option<WorkerState>,
}

struct WorkerState {
    stop_flag: Arc<AtomicBool>,
    done_flag: Arc<AtomicBool>,
    peak_bits: Arc<AtomicU32>,
    rms_bits: Arc<AtomicU32>,
    glitch_count: Arc<AtomicU32>,
    underrun_count: Arc<AtomicU32>,
    overrun_count: Arc<AtomicU32>,
    ring_fill_bits: Arc<AtomicU32>,
    thread: Option<std::thread::JoinHandle<()>>,
    shared_status: Arc<Mutex<AudioRoutingRuntimeStatus>>,
}

pub fn routing_is_active() -> bool {
    global()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .worker
        .is_some()
}

pub fn routing_start(
    input: RoutingConfigInput,
) -> Result<AudioRoutingRuntimeStatus, RoutingError> {
    if input.capture_device_id.trim().is_empty() || input.render_device_id.trim().is_empty() {
        return Err(RoutingError::InvalidInput(
            "Select both a capture device and an output device.".to_string(),
        ));
    }

    if engine_is_active() {
        return Err(RoutingError::EngineActive);
    }

    let safety = run_safety_checks(&input);
    if !safety.ok {
        return Err(RoutingError::InvalidInput(
            safety
                .error
                .unwrap_or_else(|| "Routing safety check failed.".to_string()),
        ));
    }

    let mut manager = global()
        .lock()
        .unwrap_or_else(|p| p.into_inner());

    if manager.worker.is_some() {
        return Err(RoutingError::AlreadyRunning);
    }

    let stop_flag = Arc::new(AtomicBool::new(false));
    let done_flag = Arc::new(AtomicBool::new(false));
    let peak_bits = Arc::new(AtomicU32::new(0));
    let rms_bits = Arc::new(AtomicU32::new(0));
    let glitch_count = Arc::new(AtomicU32::new(0));
    let underrun_count = Arc::new(AtomicU32::new(0));
    let overrun_count = Arc::new(AtomicU32::new(0));
    let ring_fill_bits = Arc::new(AtomicU32::new(0));

    let initial_status = AudioRoutingRuntimeStatus {
        state: RoutingState::Starting,
        capture_device_id: Some(input.capture_device_id.clone()),
        render_device_id: Some(input.render_device_id.clone()),
        sample_rate: safety.capture_sample_rate,
        input_channels: safety.capture_channels,
        output_channels: safety.render_channels,
        warning: safety.warning.clone(),
        updated_at: chrono::Utc::now().to_rfc3339(),
        ..Default::default()
    };

    let shared_status = Arc::new(Mutex::new(initial_status.clone()));

    let args = DuplexWorkerArgs {
        capture_device_id: input.capture_device_id,
        render_device_id: input.render_device_id,
        safety,
        stop_flag: stop_flag.clone(),
        done_flag: done_flag.clone(),
        peak_bits: peak_bits.clone(),
        rms_bits: rms_bits.clone(),
        glitch_count: glitch_count.clone(),
        underrun_count: underrun_count.clone(),
        overrun_count: overrun_count.clone(),
        ring_fill_bits: ring_fill_bits.clone(),
        shared_status: shared_status.clone(),
    };

    let handle = std::thread::Builder::new()
        .name("audapp-routing-worker".to_string())
        .spawn(move || run_duplex_worker(args))
        .map_err(|e| RoutingError::Platform(format!("Failed to spawn routing worker: {e}")))?;

    manager.worker = Some(WorkerState {
        stop_flag,
        done_flag,
        peak_bits,
        rms_bits,
        glitch_count,
        underrun_count,
        overrun_count,
        ring_fill_bits,
        thread: Some(handle),
        shared_status,
    });

    Ok(initial_status)
}

pub fn routing_stop() -> AudioRoutingRuntimeStatus {
    let mut manager = global()
        .lock()
        .unwrap_or_else(|p| p.into_inner());

    let Some(worker) = manager.worker.take() else {
        return stopped_status();
    };

    worker.stop_flag.store(true, Ordering::Relaxed);

    {
        if let Ok(mut s) = worker.shared_status.lock() {
            s.state = RoutingState::Stopping;
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
        if s.state == RoutingState::Stopping {
            s.state = RoutingState::Stopped;
        }
        s.updated_at = chrono::Utc::now().to_rfc3339();
        s.clone()
    };

    status
}

pub fn routing_status() -> AudioRoutingRuntimeStatus {
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
    status.glitch_count = worker.glitch_count.load(Ordering::Relaxed) as u64;
    status.underrun_count = worker.underrun_count.load(Ordering::Relaxed) as u64;
    status.overrun_count = worker.overrun_count.load(Ordering::Relaxed) as u64;
    status.ring_fill_percent =
        Some(f32::from_bits(worker.ring_fill_bits.load(Ordering::Relaxed)));

    status.updated_at = chrono::Utc::now().to_rfc3339();
    status
}

pub fn routing_shutdown() {
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

fn stopped_status() -> AudioRoutingRuntimeStatus {
    AudioRoutingRuntimeStatus {
        updated_at: chrono::Utc::now().to_rfc3339(),
        ..Default::default()
    }
}
