use std::sync::{Mutex, OnceLock};

use crate::audio::{capture_discovery_snapshot, AudioDiscoveryDevice};
use crate::audio_bridge::{
    is_active_physical_output, multichannel_bridge_is_running, multichannel_bridge_shutdown,
    multichannel_bridge_start, multichannel_bridge_status, multichannel_bridge_stop,
    resolve_multichannel_start_from_devices, resolve_physical_output_candidate, BridgeState,
    RenderEndpointInfo, ResolvedMultichannelStart,
};
use crate::audio_policy::default_endpoint::set_default_render_endpoint;
use crate::audio_policy::types::RoutingStatus;

static ROUTING: OnceLock<Mutex<RoutingState>> = OnceLock::new();

fn global() -> &'static Mutex<RoutingState> {
    ROUTING.get_or_init(|| Mutex::new(RoutingState::default()))
}

#[derive(Default)]
struct RoutingState {
    enabled: bool,
    default_changed_by_audapp: bool,
    previous_default_id: Option<String>,
    previous_default_name: Option<String>,
    audapp_default_id: Option<String>,
    audapp_default_name: Option<String>,
    selected_output_id: Option<String>,
    selected_output_name: Option<String>,
    auto_started: bool,
    last_error: Option<String>,
}

struct RoutingEnablePlan {
    start: ResolvedMultichannelStart,
    previous_default_id: Option<String>,
    previous_default_name: Option<String>,
}

// ---- Public API ----

pub fn routing_get_status() -> RoutingStatus {
    let state = {
        let state = global().lock().unwrap_or_else(|p| p.into_inner());
        RoutingStatus {
            routing_enabled: state.enabled,
            current_default_render_id: None,
            current_default_render_name: None,
            previous_default_render_id: state.previous_default_id.clone(),
            previous_default_render_name: state.previous_default_name.clone(),
            audapp_default_render_id: state.audapp_default_id.clone(),
            audapp_default_render_name: state.audapp_default_name.clone(),
            selected_output_id: state.selected_output_id.clone(),
            selected_output_name: state.selected_output_name.clone(),
            bridge_running: false,
            bridge_state: BridgeState::Stopped,
            auto_started: state.auto_started,
            restore_available: state.previous_default_id.is_some(),
            last_error: state.last_error.clone(),
        }
    };

    let bridge = multichannel_bridge_status();
    let (current_id, current_name) = get_default_render_endpoint_info();
    let live_general = discover_audapp_general_endpoint();

    let routing_enabled = state.routing_enabled
        || matches!(
            bridge.state,
            BridgeState::Starting | BridgeState::Running | BridgeState::Stopping
        );

    RoutingStatus {
        routing_enabled,
        current_default_render_id: current_id,
        current_default_render_name: current_name,
        previous_default_render_id: state.previous_default_render_id,
        previous_default_render_name: state.previous_default_render_name,
        audapp_default_render_id: state
            .audapp_default_render_id
            .or_else(|| live_general.0.clone()),
        audapp_default_render_name: state
            .audapp_default_render_name
            .or_else(|| live_general.1.clone()),
        selected_output_id: state.selected_output_id,
        selected_output_name: state.selected_output_name,
        bridge_running: bridge.running,
        bridge_state: bridge.state.clone(),
        auto_started: if routing_enabled {
            bridge.auto_started || state.auto_started
        } else {
            state.auto_started
        },
        restore_available: state.restore_available,
        last_error: bridge.last_error.or(state.last_error),
    }
}

/// Enable Audapp system routing:
/// 1. Validate the four AudappChannels endpoints and the selected physical output.
/// 2. Store the previous physical Windows default render endpoint.
/// 3. Set Windows default render to Audapp General.
/// 4. Start the multi-channel bridge to the selected physical output.
pub fn routing_enable(output_endpoint_id: String) -> Result<RoutingStatus, String> {
    if multichannel_bridge_is_running() {
        return Err(record_failure(
            "Multi-channel bridge is already running. Disable Audapp Routing first.".to_string(),
        ));
    }

    let previous_restore_target_id = {
        let state = global().lock().unwrap_or_else(|p| p.into_inner());
        state.previous_default_id.clone()
    };

    let snapshot = capture_discovery_snapshot();
    let (current_default_id, current_default_name) = with_com(get_default_render_endpoint_info_com)
        .map_err(record_failure)?;

    let plan = build_routing_enable_plan(
        &snapshot.devices,
        current_default_id.as_deref(),
        current_default_name.as_deref(),
        Some(output_endpoint_id.as_str()),
        previous_restore_target_id.as_deref(),
        false,
    )
    .map_err(record_failure)?;

    activate_routing_plan(plan)
}

/// Disable Audapp system routing:
/// 1. Stop the multi-channel bridge.
/// 2. Restore the previous physical default render endpoint when available.
pub fn routing_disable() -> RoutingStatus {
    let bridge = multichannel_bridge_stop();
    let (restore_id, should_restore) = {
        let state = global().lock().unwrap_or_else(|p| p.into_inner());
        (
            state.previous_default_id.clone(),
            state.default_changed_by_audapp && state.previous_default_id.is_some(),
        )
    };

    let restore_error = if should_restore {
        restore_default_render_endpoint(restore_id.as_deref())
    } else {
        None
    };

    let mut state = global().lock().unwrap_or_else(|p| p.into_inner());
    state.enabled = false;
    state.auto_started = false;
    state.default_changed_by_audapp = restore_error.is_some() && state.previous_default_id.is_some();
    state.last_error = restore_error
        .map(|error| {
            format!(
                "Restore failed: {error}. Manually set output in Windows Sound settings."
            )
        })
        .or(bridge.last_error);
    drop(state);

    routing_get_status()
}

/// Safe minimal app-open auto-start.
///
/// When the four AudappChannels outputs and a physical output are present, this:
/// 1. Stores the current physical default endpoint for restore.
/// 2. Sets Windows default render to Audapp General.
/// 3. Starts the multi-channel bridge.
///
/// Failures are stored in status but never panic the app.
pub fn routing_auto_start() {
    if multichannel_bridge_is_running() {
        return;
    }

    let (preferred_output_id, previous_restore_target_id) = {
        let state = global().lock().unwrap_or_else(|p| p.into_inner());
        (
            state.selected_output_id.clone(),
            state.previous_default_id.clone(),
        )
    };

    let snapshot = capture_discovery_snapshot();
    let (current_default_id, current_default_name) = match with_com(get_default_render_endpoint_info_com)
    {
        Ok(value) => value,
        Err(error) => {
            let _ = record_failure(error);
            return;
        }
    };

    let plan = match build_routing_enable_plan(
        &snapshot.devices,
        current_default_id.as_deref(),
        current_default_name.as_deref(),
        preferred_output_id.as_deref(),
        previous_restore_target_id.as_deref(),
        true,
    ) {
        Ok(plan) => plan,
        Err(error) => {
            let _ = record_failure(error);
            return;
        }
    };

    let _ = activate_routing_plan(plan);
}

/// Best-effort shutdown cleanup.
///
/// This stops the multi-channel bridge and restores the previous Windows default
/// output only when Audapp had changed it.
pub fn routing_shutdown() {
    multichannel_bridge_shutdown();

    let (restore_id, should_restore) = {
        let state = global().lock().unwrap_or_else(|p| p.into_inner());
        (
            state.previous_default_id.clone(),
            state.default_changed_by_audapp && state.previous_default_id.is_some(),
        )
    };

    let restore_error = if should_restore {
        restore_default_render_endpoint(restore_id.as_deref())
    } else {
        None
    };

    let mut state = global().lock().unwrap_or_else(|p| p.into_inner());
    state.enabled = false;
    state.auto_started = false;
    state.default_changed_by_audapp = restore_error.is_some() && state.previous_default_id.is_some();
    if let Some(error) = restore_error {
        state.last_error = Some(format!(
            "Restore failed during shutdown: {error}. Manually set output in Windows Sound settings."
        ));
    }
}

// ---- Planning / activation helpers ----

fn activate_routing_plan(plan: RoutingEnablePlan) -> Result<RoutingStatus, String> {
    let set_default_result =
        with_com(|| set_default_render_endpoint(&plan.start.config.general_endpoint_id));
    if let Err(error) = set_default_result {
        return Err(store_plan_error(
            &plan,
            format!("SetDefaultEndpoint failed: {error}"),
            false,
        ));
    }

    match multichannel_bridge_start(plan.start.config.clone()) {
        Ok(_) => {
            let mut state = global().lock().unwrap_or_else(|p| p.into_inner());
            state.enabled = true;
            state.default_changed_by_audapp = true;
            state.previous_default_id = plan.previous_default_id.clone();
            state.previous_default_name = plan.previous_default_name.clone();
            state.audapp_default_id = Some(plan.start.config.general_endpoint_id.clone());
            state.audapp_default_name = Some(plan.start.general_name.clone());
            state.selected_output_id = Some(plan.start.config.output_endpoint_id.clone());
            state.selected_output_name = Some(plan.start.output_name.clone());
            state.auto_started = plan.start.config.auto_started;
            state.last_error = None;
            drop(state);
            Ok(routing_get_status())
        }
        Err(error) => Err(store_plan_error(
            &plan,
            format!("Failed to start multi-channel bridge: {error}"),
            true,
        )),
    }
}

fn store_plan_error(plan: &RoutingEnablePlan, base_message: String, try_restore: bool) -> String {
    let restore_error = if try_restore {
        restore_default_render_endpoint(plan.previous_default_id.as_deref())
    } else {
        None
    };
    let restore_failed = restore_error.is_some();

    let message = if let Some(error) = restore_error.as_deref() {
        format!(
            "{base_message}. Windows default restore also failed: {error}. Manually set output in Windows Sound settings."
        )
    } else {
        base_message
    };

    let mut state = global().lock().unwrap_or_else(|p| p.into_inner());
    state.enabled = false;
    state.default_changed_by_audapp = restore_failed && state.previous_default_id.is_some();
    state.previous_default_id = plan.previous_default_id.clone();
    state.previous_default_name = plan.previous_default_name.clone();
    state.audapp_default_id = Some(plan.start.config.general_endpoint_id.clone());
    state.audapp_default_name = Some(plan.start.general_name.clone());
    state.selected_output_id = Some(plan.start.config.output_endpoint_id.clone());
    state.selected_output_name = Some(plan.start.output_name.clone());
    state.auto_started = plan.start.config.auto_started;
    state.last_error = Some(message.clone());
    message
}

fn record_failure(message: String) -> String {
    let mut state = global().lock().unwrap_or_else(|p| p.into_inner());
    state.enabled = false;
    state.auto_started = false;
    state.last_error = Some(message.clone());
    message
}

fn build_routing_enable_plan(
    devices: &[AudioDiscoveryDevice],
    current_default_id: Option<&str>,
    current_default_name: Option<&str>,
    saved_selected_output_id: Option<&str>,
    previous_restore_target_id: Option<&str>,
    auto_started: bool,
) -> Result<RoutingEnablePlan, String> {
    // 1. Resolve the physical (non-Audapp) render output FIRST. This is guaranteed
    //    to never be an Audapp endpoint, even when the current Windows default is
    //    Audapp Input / Audapp General / etc.
    let physical_output = resolve_physical_output_candidate(
        devices,
        saved_selected_output_id,
        previous_restore_target_id,
        current_default_id,
    )?;

    // 2. Build the multi-channel start config against that physical output.
    let start =
        resolve_multichannel_start_from_devices(devices, Some(&physical_output.id), auto_started)?;

    // 3. Choose a restore target that is ALWAYS a physical, non-Audapp endpoint.
    let (previous_default_id, previous_default_name) =
        choose_restore_target(devices, current_default_id, &physical_output);

    Ok(RoutingEnablePlan {
        start,
        previous_default_id,
        previous_default_name,
    })
}

/// Decide which endpoint to restore the Windows default to on disable/shutdown.
///
/// The restore target must never be an Audapp endpoint — restoring the default to
/// Audapp Input/General/etc. would leave the system silent. We therefore only keep
/// the current Windows default when it can be confirmed to be an active, non-Audapp
/// physical endpoint; otherwise we restore to the resolved physical output.
fn choose_restore_target(
    devices: &[AudioDiscoveryDevice],
    current_default_id: Option<&str>,
    physical_output: &RenderEndpointInfo,
) -> (Option<String>, Option<String>) {
    if let Some(default_id) = current_default_id {
        if let Some(device) = find_device_by_id(devices, default_id) {
            if is_active_physical_output(device) {
                return (Some(device.id.clone()), Some(device.name.clone()));
            }
        }
    }

    (
        Some(physical_output.id.clone()),
        Some(physical_output.name.clone()),
    )
}

fn find_device_by_id<'a>(
    devices: &'a [AudioDiscoveryDevice],
    device_id: &str,
) -> Option<&'a AudioDiscoveryDevice> {
    devices.iter().find(|device| device.id == device_id)
}

fn discover_audapp_general_endpoint() -> (Option<String>, Option<String>) {
    let snapshot = capture_discovery_snapshot();
    let endpoint = snapshot.devices.iter().find(|device| {
        device.kind == "output"
            && device.state == "active"
            && device.is_audapp_endpoint
            && device.audapp_endpoint_kind.as_deref() == Some("channel_output")
            && device.audapp_channel_id.as_deref() == Some("general")
    });

    endpoint
        .map(|device| (Some(device.id.clone()), Some(device.name.clone())))
        .unwrap_or((None, None))
}

fn restore_default_render_endpoint(device_id: Option<&str>) -> Option<String> {
    device_id.and_then(|id| with_com(|| set_default_render_endpoint(id)).err())
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
    with_com(get_default_render_endpoint_info_com).unwrap_or_default()
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

#[cfg(test)]
mod tests {
    use super::*;

    fn output_device(
        id: &str,
        name: &str,
        is_default: bool,
        audapp_endpoint_kind: Option<&str>,
        audapp_channel_id: Option<&str>,
    ) -> AudioDiscoveryDevice {
        AudioDiscoveryDevice {
            id: id.to_string(),
            name: name.to_string(),
            kind: "output".to_string(),
            state: "active".to_string(),
            is_default,
            is_audapp_endpoint: audapp_endpoint_kind.is_some(),
            audapp_endpoint_kind: audapp_endpoint_kind.map(str::to_string),
            audapp_channel_id: audapp_channel_id.map(str::to_string),
        }
    }

    fn baseline_devices() -> Vec<AudioDiscoveryDevice> {
        vec![
            output_device(
                "general-id",
                "Hoparlor (Audapp General)",
                false,
                Some("channel_output"),
                Some("general"),
            ),
            output_device(
                "music-id",
                "Hoparlor (Audapp Music)",
                false,
                Some("channel_output"),
                Some("music"),
            ),
            output_device(
                "game-id",
                "Hoparlor (Audapp Game)",
                false,
                Some("channel_output"),
                Some("game"),
            ),
            output_device(
                "browser-id",
                "Hoparlor (Audapp Browser)",
                false,
                Some("channel_output"),
                Some("browser"),
            ),
            output_device(
                "speaker-id",
                "Speakers (USB Audio Device)",
                true,
                None,
                None,
            ),
        ]
    }

    #[test]
    fn routing_enable_targets_audapp_general_as_default_endpoint() {
        let plan = build_routing_enable_plan(
            &baseline_devices(),
            Some("speaker-id"),
            Some("Speakers (USB Audio Device)"),
            Some("speaker-id"),
            None,
            false,
        )
        .expect("plan");

        assert_eq!(plan.start.config.general_endpoint_id, "general-id");
        assert_eq!(plan.start.general_name, "Hoparlor (Audapp General)");
        assert_eq!(plan.previous_default_id.as_deref(), Some("speaker-id"));
    }

    #[test]
    fn routing_enable_uses_selected_physical_output_as_restore_target_when_default_is_audapp() {
        let plan = build_routing_enable_plan(
            &baseline_devices(),
            Some("browser-id"),
            Some("Hoparlor (Audapp Browser)"),
            Some("speaker-id"),
            None,
            true,
        )
        .expect("plan");

        // Physical render output is the speaker, never the Audapp Browser default.
        assert_eq!(plan.start.config.output_endpoint_id, "speaker-id");
        // Restore target must be the physical speaker, never Audapp Browser.
        assert_eq!(plan.previous_default_id.as_deref(), Some("speaker-id"));
        assert_eq!(
            plan.previous_default_name.as_deref(),
            Some("Speakers (USB Audio Device)")
        );
    }

    #[test]
    fn routing_enable_never_restores_to_audapp_when_default_missing_from_snapshot() {
        // Regression: previously, if the current default id was not present in the
        // discovery snapshot, it was stored verbatim as the restore target — which
        // could be Audapp Input. The restore target must always be physical.
        let plan = build_routing_enable_plan(
            &baseline_devices(),
            Some("audapp-input-id-not-in-snapshot"),
            Some("Hoparlor (Audapp Input)"),
            None,
            None,
            true,
        )
        .expect("plan");

        assert_eq!(plan.previous_default_id.as_deref(), Some("speaker-id"));
        assert_eq!(plan.start.config.output_endpoint_id, "speaker-id");
    }
}
