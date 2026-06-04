use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use super::types::{VoiceDevice, VoiceLabSettings, VoiceLabState, VoiceLabStatus};
use super::worker::{list_capture_devices, list_render_devices, run_voice_worker, VoiceWorkerArgs};

static VOICE_LAB: OnceLock<Mutex<VoiceLabManager>> = OnceLock::new();

fn global() -> &'static Mutex<VoiceLabManager> {
    VOICE_LAB.get_or_init(|| Mutex::new(VoiceLabManager { worker: None }))
}

struct VoiceLabManager {
    worker: Option<VoiceWorkerState>,
}

struct VoiceWorkerState {
    stop_flag: Arc<AtomicBool>,
    done_flag: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    shared_status: Arc<Mutex<VoiceLabStatus>>,
    shared_settings: Arc<Mutex<VoiceLabSettings>>,
}

pub fn voice_start(settings: VoiceLabSettings) -> Result<VoiceLabStatus, String> {
    let mut manager = global().lock().unwrap_or_else(|p| p.into_inner());

    if manager.worker.is_some() {
        return Err("Voice lab is already running. Stop it first.".to_string());
    }

    let stop_flag = Arc::new(AtomicBool::new(false));
    let done_flag = Arc::new(AtomicBool::new(false));

    let initial_status = VoiceLabStatus {
        state: VoiceLabState::Starting,
        updated_at: chrono::Utc::now().to_rfc3339(),
        ..Default::default()
    };

    let shared_status = Arc::new(Mutex::new(initial_status.clone()));
    let shared_settings = Arc::new(Mutex::new(settings));

    let args = VoiceWorkerArgs {
        stop_flag: stop_flag.clone(),
        done_flag: done_flag.clone(),
        shared_status: shared_status.clone(),
        shared_settings: shared_settings.clone(),
    };

    let handle = std::thread::Builder::new()
        .name("audapp-voice-worker".to_string())
        .spawn(move || run_voice_worker(args))
        .map_err(|e| format!("Failed to spawn voice worker: {e}"))?;

    manager.worker = Some(VoiceWorkerState {
        stop_flag,
        done_flag,
        thread: Some(handle),
        shared_status,
        shared_settings,
    });

    Ok(initial_status)
}

pub fn voice_stop() -> VoiceLabStatus {
    let mut manager = global().lock().unwrap_or_else(|p| p.into_inner());

    let Some(worker) = manager.worker.take() else {
        return stopped_status();
    };

    worker.stop_flag.store(true, Ordering::Relaxed);

    if let Ok(mut s) = worker.shared_status.lock() {
        s.state = VoiceLabState::Stopping;
        s.updated_at = chrono::Utc::now().to_rfc3339();
    }

    if let Some(thread) = worker.thread {
        let _ = thread.join();
    }

    let status = {
        let mut s = worker
            .shared_status
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        if s.state == VoiceLabState::Stopping {
            s.state = VoiceLabState::Stopped;
        }
        s.updated_at = chrono::Utc::now().to_rfc3339();
        s.clone()
    };

    status
}

pub fn voice_status() -> VoiceLabStatus {
    let manager = global().lock().unwrap_or_else(|p| p.into_inner());

    let Some(worker) = &manager.worker else {
        return stopped_status();
    };

    if worker.done_flag.load(Ordering::Relaxed) {
        let mut s = worker
            .shared_status
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        if s.state == VoiceLabState::Running {
            s.state = VoiceLabState::Stopped;
            s.running = false;
        }
        s.updated_at = chrono::Utc::now().to_rfc3339();
        return s.clone();
    }

    let mut s = worker
        .shared_status
        .lock()
        .unwrap_or_else(|p| p.into_inner());
    s.updated_at = chrono::Utc::now().to_rfc3339();
    s.clone()
}

pub fn voice_set_settings(settings: VoiceLabSettings) -> VoiceLabStatus {
    let manager = global().lock().unwrap_or_else(|p| p.into_inner());

    if let Some(worker) = &manager.worker {
        let mut s = worker
            .shared_settings
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        *s = settings;
        drop(s);

        return worker
            .shared_status
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone();
    }

    stopped_status()
}

pub fn voice_shutdown() {
    let mut manager = global().lock().unwrap_or_else(|p| p.into_inner());

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

pub fn voice_list_inputs() -> Result<Vec<VoiceDevice>, String> {
    list_capture_devices()
}

pub fn voice_list_outputs() -> Result<Vec<VoiceDevice>, String> {
    list_render_devices()
}

fn stopped_status() -> VoiceLabStatus {
    VoiceLabStatus {
        updated_at: chrono::Utc::now().to_rfc3339(),
        ..Default::default()
    }
}
