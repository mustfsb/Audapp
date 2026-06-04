use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use crate::audio_bridge::types::{
    BridgeCandidate, BridgeCandidates, BridgePocConfig, BridgePocStatus, BridgeState,
};
use crate::audio_bridge::worker::{run_bridge_worker, BridgeWorkerArgs};

static BRIDGE: OnceLock<Mutex<BridgeManager>> = OnceLock::new();

fn global() -> &'static Mutex<BridgeManager> {
    BRIDGE.get_or_init(|| Mutex::new(BridgeManager { worker: None }))
}

struct BridgeManager {
    worker: Option<WorkerState>,
}

struct WorkerState {
    stop_flag: Arc<AtomicBool>,
    done_flag: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    shared_status: Arc<Mutex<BridgePocStatus>>,
}

pub fn bridge_start(config: BridgePocConfig) -> Result<BridgePocStatus, String> {
    let mut manager = global().lock().unwrap_or_else(|p| p.into_inner());

    if manager.worker.is_some() {
        return Err("Bridge POC is already running. Stop it first.".to_string());
    }

    let stop_flag = Arc::new(AtomicBool::new(false));
    let done_flag = Arc::new(AtomicBool::new(false));

    let initial_status = BridgePocStatus {
        state: BridgeState::Starting,
        running: false,
        updated_at: chrono::Utc::now().to_rfc3339(),
        ..Default::default()
    };

    let shared_status = Arc::new(Mutex::new(initial_status.clone()));

    let args = BridgeWorkerArgs {
        config,
        stop_flag: stop_flag.clone(),
        done_flag: done_flag.clone(),
        shared_status: shared_status.clone(),
    };

    let handle = std::thread::Builder::new()
        .name("audapp-bridge-worker".to_string())
        .spawn(move || run_bridge_worker(args))
        .map_err(|e| format!("Failed to spawn bridge worker: {e}"))?;

    manager.worker = Some(WorkerState {
        stop_flag,
        done_flag,
        thread: Some(handle),
        shared_status,
    });

    Ok(initial_status)
}

pub fn bridge_stop() -> BridgePocStatus {
    let mut manager = global().lock().unwrap_or_else(|p| p.into_inner());

    let Some(worker) = manager.worker.take() else {
        return stopped_status();
    };

    worker.stop_flag.store(true, Ordering::Relaxed);

    if let Ok(mut s) = worker.shared_status.lock() {
        s.state = BridgeState::Stopping;
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
        if s.state == BridgeState::Stopping {
            s.state = BridgeState::Stopped;
        }
        s.updated_at = chrono::Utc::now().to_rfc3339();
        s.clone()
    };

    status
}

pub fn bridge_status() -> BridgePocStatus {
    let manager = global().lock().unwrap_or_else(|p| p.into_inner());

    let Some(worker) = &manager.worker else {
        return stopped_status();
    };

    // Check if worker thread has exited
    if worker.done_flag.load(Ordering::Relaxed) {
        let mut s = worker
            .shared_status
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        if s.state == BridgeState::Running {
            s.state = BridgeState::Stopped;
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

pub fn bridge_shutdown() {
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

fn stopped_status() -> BridgePocStatus {
    BridgePocStatus {
        updated_at: chrono::Utc::now().to_rfc3339(),
        ..Default::default()
    }
}

pub fn bridge_list_candidates() -> Result<BridgeCandidates, String> {
    #[cfg(windows)]
    {
        return list_candidates_windows();
    }
    #[cfg(not(windows))]
    {
        Err("Bridge requires Windows.".to_string())
    }
}

#[cfg(windows)]
fn list_candidates_windows() -> Result<BridgeCandidates, String> {
    use windows::core::HRESULT;
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

    const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106u32 as i32);

    let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let should_uninit = if hr.is_ok() {
        true
    } else if hr == RPC_E_CHANGED_MODE {
        false
    } else {
        return Err(format!("COM init failed: {hr}"));
    };

    let result = list_candidates_inner();

    if should_uninit {
        unsafe { CoUninitialize() };
    }

    result
}

#[cfg(windows)]
fn list_candidates_inner() -> Result<BridgeCandidates, String> {
    use windows::Win32::Media::Audio::{
        eCapture, eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
        DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

    let enumerator: IMMDeviceEnumerator =
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
            .map_err(|e| format!("IMMDeviceEnumerator failed: {e}"))?;

    let default_render_id: Option<String> = unsafe {
        enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .ok()
    }
    .and_then(|dev| read_dev_id(&dev));

    let render_col = unsafe { enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) }
        .map_err(|e| format!("EnumAudioEndpoints(render) failed: {e}"))?;
    let render_count = unsafe { render_col.GetCount() }.unwrap_or(0);

    let mut audapp_render: Option<BridgeCandidate> = None;
    let mut physical_outputs: Vec<BridgeCandidate> = Vec::new();

    for i in 0..render_count {
        if let Ok(dev) = unsafe { render_col.Item(i) } {
            let Some(id) = read_dev_id(&dev) else {
                continue;
            };
            let name = read_dev_name(&dev);
            let is_default = default_render_id.as_deref().is_some_and(|d| d == id);
            let c = BridgeCandidate {
                id,
                name: name.clone(),
                is_default,
            };
            if name.to_lowercase().contains("audapp") {
                audapp_render = Some(c);
            } else {
                physical_outputs.push(c);
            }
        }
    }

    let cap_col = unsafe { enumerator.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE) }
        .map_err(|e| format!("EnumAudioEndpoints(capture) failed: {e}"))?;
    let cap_count = unsafe { cap_col.GetCount() }.unwrap_or(0);

    let mut audapp_capture: Option<BridgeCandidate> = None;

    for i in 0..cap_count {
        if let Ok(dev) = unsafe { cap_col.Item(i) } {
            let Some(id) = read_dev_id(&dev) else {
                continue;
            };
            let name = read_dev_name(&dev);
            if name.to_lowercase().contains("audapp") {
                audapp_capture = Some(BridgeCandidate {
                    id,
                    name,
                    is_default: false,
                });
            }
        }
    }

    Ok(BridgeCandidates {
        audapp_render,
        physical_outputs,
        audapp_capture,
    })
}

#[cfg(windows)]
fn read_dev_id(device: &windows::Win32::Media::Audio::IMMDevice) -> Option<String> {
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
        let s = String::from_utf16_lossy(std::slice::from_raw_parts(pwstr.0, len));
        CoTaskMemFree(Some(pwstr.0 as _));
        Some(s)
    }
}

#[cfg(windows)]
fn read_dev_name(device: &windows::Win32::Media::Audio::IMMDevice) -> String {
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;
    use windows::Win32::System::Com::{CoTaskMemFree, STGM_READ};
    unsafe {
        let Ok(store) = device.OpenPropertyStore(STGM_READ) else {
            return String::new();
        };
        let Ok(val) = store.GetValue(&PKEY_Device_FriendlyName) else {
            return String::new();
        };
        let Ok(pwstr) = PropVariantToStringAlloc(&val) else {
            return String::new();
        };
        if pwstr.is_null() {
            return String::new();
        }
        let mut len = 0usize;
        while *pwstr.0.add(len) != 0 {
            len += 1;
        }
        let s = String::from_utf16_lossy(std::slice::from_raw_parts(pwstr.0, len));
        CoTaskMemFree(Some(pwstr.0 as _));
        s
    }
}
