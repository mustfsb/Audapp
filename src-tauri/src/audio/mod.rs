mod assignments;
mod audapp_endpoint;
mod controls;
mod devices;
mod diagnostics;
mod errors;
mod mixer_settings;
#[cfg(windows)]
mod process;
mod route_support;
mod session_intents;
#[cfg(windows)]
mod sessions;
mod targeting;
mod types;

#[cfg(windows)]
mod com;

pub use assignments::{
    load_assignments, match_rule_from_session, remove_assignment, upsert_assignment,
};
pub use controls::{set_session_mute_with_snapshot, set_session_volume_with_snapshot};
pub use diagnostics::{
    enumerate_endpoint_diagnostics, probe_endpoint, AudioEndpointDiagnostic, EndpointProbeResult,
};
pub use mixer_settings::{
    load_mixer_channel_settings, reset_mixer_channel_settings, upsert_mixer_channel_setting,
    MixerChannelSetting,
};
pub use route_support::{get_session_route_capability, SessionRouteCapability};
pub use session_intents::{
    clear_route_intent_for_target, get_route_intent_for_target, load_session_route_intents,
    route_intent_key_from_target, set_route_intent_for_target, SessionRouteIntent,
    SessionRouteIntentEntry,
};
use types::AudioDiscoveryStatus;
pub use types::{
    AudioDiscoverySession, AudioDiscoverySnapshot, AudioSessionControlResult, AudioSessionTarget,
    ChannelAssignment, ChannelAssignmentMatch,
};

/// Returns a complete Windows Core Audio discovery snapshot.
pub fn capture_discovery_snapshot() -> AudioDiscoverySnapshot {
    #[cfg(windows)]
    {
        return capture_windows_snapshot();
    }

    #[cfg(not(windows))]
    {
        AudioDiscoverySnapshot::unavailable(
            "Windows audio discovery is only available on Windows builds.",
        )
    }
}

#[cfg(windows)]
fn capture_windows_snapshot() -> AudioDiscoverySnapshot {
    let refreshed_at = chrono::Utc::now().to_rfc3339();
    let mut warnings: Vec<String> = Vec::new();

    let snapshot_result = com::with_com(|| {
        let mut devices = Vec::new();
        match devices::enumerate_devices(&mut warnings) {
            Ok(found) => devices = found,
            Err(error) => warnings.push(error.message),
        }

        let mut sessions = Vec::new();
        match sessions::enumerate_sessions(&devices, &mut warnings) {
            Ok(found) => sessions = found,
            Err(error) => warnings.push(error.message),
        }

        Ok((devices, sessions))
    });

    let (devices, sessions) = match snapshot_result {
        Ok(pair) => pair,
        Err(error) => {
            return AudioDiscoverySnapshot {
                devices: Vec::new(),
                sessions: Vec::new(),
                status: AudioDiscoveryStatus {
                    source: "windows-core-audio".to_string(),
                    state: "error".to_string(),
                    warnings: vec![error.message],
                    refreshed_at: Some(refreshed_at),
                    device_count: 0,
                    session_count: 0,
                },
            };
        }
    };

    let device_count = devices.len();
    let session_count = sessions.len();

    let state = if device_count == 0 && session_count == 0 && warnings.is_empty() {
        "empty".to_string()
    } else if warnings.iter().any(|warning| {
        warning.to_lowercase().contains("failed to initialize com")
            || warning.to_lowercase().contains("device enumerator")
    }) {
        "error".to_string()
    } else {
        "ready".to_string()
    };

    AudioDiscoverySnapshot {
        devices,
        sessions,
        status: AudioDiscoveryStatus {
            source: "windows-core-audio".to_string(),
            state,
            warnings,
            refreshed_at: Some(refreshed_at),
            device_count,
            session_count,
        },
    }
}
