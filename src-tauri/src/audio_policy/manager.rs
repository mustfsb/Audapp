use std::sync::{Mutex, OnceLock};

use crate::audio_bridge::{bridge_start, bridge_status, bridge_stop, BridgePocConfig};
use crate::audio_policy::default_endpoint::set_default_render_endpoint;
use crate::audio_policy::types::RoutingStatus;

static ROUTING: OnceLock<Mutex<RoutingState>> = OnceLock::new();

fn global() -> &'static Mutex<RoutingState> {
    ROUTING.get_or_init(|| Mutex::new(RoutingState::default()))
}

#[derive(Default)]
struct RoutingState {
    enabled: bool,
    previous_default_id: Option<String>,
    previous_default_name: Option<String>,
    audapp_render_id: Option<String>,
    audapp_render_name: Option<String>,
    selected_output_id: Option<String>,
    selected_output_name: Option<String>,
    last_error: Option<String>,
}

// ---- Public API ----

pub fn routing_get_status() -> RoutingStatus {
    // Clone all state fields, then drop the lock before any COM calls.
    let (
        enabled,
        prev_id,
        prev_name,
        stored_audapp_id,
        stored_audapp_name,
        sel_id,
        sel_name,
        last_err,
    ) = {
        let state = global().lock().unwrap_or_else(|p| p.into_inner());
        (
            state.enabled,
            state.previous_default_id.clone(),
            state.previous_default_name.clone(),
            state.audapp_render_id.clone(),
            state.audapp_render_name.clone(),
            state.selected_output_id.clone(),
            state.selected_output_name.clone(),
            state.last_error.clone(),
        )
    };

    let bridge = bridge_status();
    let (current_id, current_name) = get_default_render_endpoint_info();

    // Live scan for the Audapp render endpoint. When routing is not yet enabled,
    // stored_audapp_id is None — scan COM so the UI can show the endpoint and
    // enable the routing button before the user clicks Enable.
    let (audapp_id, audapp_name, scan_err) = if stored_audapp_id.is_some() {
        (stored_audapp_id, stored_audapp_name, None)
    } else {
        match with_com(|| find_audapp_render_com()) {
            Ok((id, name)) => (Some(id), Some(name), None),
            Err(e) => (None, None, Some(e)),
        }
    };

    let restore_available = prev_id.is_some();

    RoutingStatus {
        routing_enabled: enabled,
        current_default_render_id: current_id,
        current_default_render_name: current_name,
        previous_default_render_id: prev_id,
        previous_default_render_name: prev_name,
        audapp_render_id: audapp_id,
        audapp_render_name: audapp_name,
        selected_output_id: sel_id,
        selected_output_name: sel_name,
        bridge_running: bridge.running,
        restore_available,
        last_error: scan_err.or(last_err),
    }
}

/// Enable Audapp system routing:
/// 1. Store current Windows default render endpoint.
/// 2. Set default render to Audapp Input.
/// 3. Start bridge to selected physical output.
pub fn routing_enable(output_endpoint_id: String) -> Result<RoutingStatus, String> {
    let mut state = global().lock().unwrap_or_else(|p| p.into_inner());

    // COM init for this thread
    with_com(|| -> Result<(), String> {
        // Get current default render endpoint
        let (prev_id, prev_name) = get_default_render_endpoint_info_com()?;

        // Find Audapp Input render endpoint
        let (audapp_id, audapp_name) = find_audapp_render_com()?;

        // Safety: don't route Audapp Input to itself
        if output_endpoint_id == audapp_id {
            return Err(
                "Cannot route Audapp Input to itself. Select a different physical output.".into(),
            );
        }

        // Find output endpoint name for display
        let output_name = get_endpoint_name_com(&output_endpoint_id)
            .unwrap_or_else(|_| output_endpoint_id.clone());

        // Store previous default (only if it's not already Audapp Input)
        if prev_id.as_deref() != Some(&audapp_id) {
            state.previous_default_id = prev_id;
            state.previous_default_name = prev_name;
        }

        state.audapp_render_id = Some(audapp_id.clone());
        state.audapp_render_name = Some(audapp_name.clone());
        state.selected_output_id = Some(output_endpoint_id.clone());
        state.selected_output_name = Some(output_name.clone());

        // Set Windows default render to Audapp Input
        set_default_render_endpoint(&audapp_id)
            .map_err(|e| format!("SetDefaultEndpoint failed: {e}"))?;

        state.enabled = true;
        state.last_error = None;
        Ok(())
    })
    .map_err(|e| {
        state.last_error = Some(e.clone());
        e
    })?;

    // Start bridge (drop state lock before calling bridge_start)
    let (audapp_id, output_id) = {
        (
            state.audapp_render_id.clone(),
            state.selected_output_id.clone(),
        )
    };
    drop(state);

    let config = BridgePocConfig {
        audapp_render_endpoint_id: audapp_id,
        audapp_capture_endpoint_id: None,
        monitor_output_endpoint_id: output_id,
        enable_render_loopback_capture: true,
        enable_capture_endpoint_read: false,
        enable_physical_monitor_output: true,
    };

    if let Err(e) = bridge_start(config) {
        let mut state = global().lock().unwrap_or_else(|p| p.into_inner());
        state.last_error = Some(format!("Bridge start failed: {e}"));
        // Bridge didn't start but routing is still changed — still report enabled
    }

    Ok(routing_get_status())
}

/// Disable Audapp system routing:
/// 1. Stop bridge.
/// 2. Restore previous default render endpoint.
pub fn routing_disable() -> RoutingStatus {
    bridge_stop();

    let prev_id = {
        let state = global().lock().unwrap_or_else(|p| p.into_inner());
        state.previous_default_id.clone()
    };

    let restore_err = if let Some(ref id) = prev_id {
        with_com(|| set_default_render_endpoint(id)).err()
    } else {
        None
    };

    let mut state = global().lock().unwrap_or_else(|p| p.into_inner());
    state.enabled = false;
    state.last_error = restore_err
        .map(|e| format!("Restore failed: {e}. Manually set output in Windows Sound settings."));

    let bridge = bridge_status();
    let (current_id, current_name) = get_default_render_endpoint_info();

    RoutingStatus {
        routing_enabled: false,
        current_default_render_id: current_id,
        current_default_render_name: current_name,
        previous_default_render_id: state.previous_default_id.clone(),
        previous_default_render_name: state.previous_default_name.clone(),
        audapp_render_id: state.audapp_render_id.clone(),
        audapp_render_name: state.audapp_render_name.clone(),
        selected_output_id: state.selected_output_id.clone(),
        selected_output_name: state.selected_output_name.clone(),
        bridge_running: bridge.running,
        restore_available: state.previous_default_id.is_some(),
        last_error: state.last_error.clone(),
    }
}

// ---- COM helpers ----

fn with_com<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    #[cfg(windows)]
    {
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

        let result = f();

        if should_uninit {
            unsafe { CoUninitialize() };
        }

        result
    }
    #[cfg(not(windows))]
    {
        f()
    }
}

fn get_default_render_endpoint_info() -> (Option<String>, Option<String>) {
    with_com(|| get_default_render_endpoint_info_com()).unwrap_or_default()
}

#[cfg(windows)]
fn get_default_render_endpoint_info_com() -> Result<(Option<String>, Option<String>), String> {
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

    let enumerator: IMMDeviceEnumerator =
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
            .map_err(|e| format!("IMMDeviceEnumerator: {e}"))?;

    let dev = match unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) } {
        Ok(d) => d,
        Err(_) => return Ok((None, None)),
    };

    let id = get_device_id(&dev);
    let name = get_friendly_name(&dev);
    Ok((id, Some(name).filter(|n| !n.is_empty())))
}

#[cfg(not(windows))]
fn get_default_render_endpoint_info_com() -> Result<(Option<String>, Option<String>), String> {
    Ok((None, None))
}

#[cfg(windows)]
fn find_audapp_render_com() -> Result<(String, String), String> {
    use windows::Win32::Media::Audio::{
        eRender, IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

    let enumerator: IMMDeviceEnumerator =
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
            .map_err(|e| format!("IMMDeviceEnumerator: {e}"))?;

    let col = unsafe { enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) }
        .map_err(|e| format!("EnumAudioEndpoints: {e}"))?;
    let count = unsafe { col.GetCount() }.unwrap_or(0);

    for i in 0..count {
        if let Ok(dev) = unsafe { col.Item(i) } {
            let name = get_friendly_name(&dev);
            if name.to_lowercase().contains("audapp") {
                if let Some(id) = get_device_id(&dev) {
                    return Ok((id, name));
                }
            }
        }
    }

    Err("Audapp Input render endpoint not found. Is the driver running?".into())
}

#[cfg(not(windows))]
fn find_audapp_render_com() -> Result<(String, String), String> {
    Err("Platform not supported.".into())
}

#[cfg(windows)]
fn get_endpoint_name_com(device_id: &str) -> Result<String, String> {
    use windows::Win32::Media::Audio::{IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

    let enumerator: IMMDeviceEnumerator =
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
            .map_err(|e| format!("IMMDeviceEnumerator: {e}"))?;

    let hid = windows::core::HSTRING::from(device_id);
    let dev = unsafe { enumerator.GetDevice(&hid) }.map_err(|e| format!("GetDevice: {e}"))?;

    Ok(get_friendly_name(&dev))
}

#[cfg(not(windows))]
fn get_endpoint_name_com(_id: &str) -> Result<String, String> {
    Err("Platform not supported.".into())
}

// ---- Low-level device property helpers ----

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
        let s = String::from_utf16_lossy(std::slice::from_raw_parts(pwstr.0, len));
        CoTaskMemFree(Some(pwstr.0 as _));
        Some(s)
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
