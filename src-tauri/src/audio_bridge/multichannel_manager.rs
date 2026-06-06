use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use crate::audio::{capture_discovery_snapshot, AudioDiscoveryDevice};
use crate::audio_bridge::endpoints::{
    find_active_output_device_by_id, physical_output_endpoints_from_devices,
    require_multichannel_endpoints, resolve_audapp_render_endpoints_from_devices,
    resolve_physical_output_candidate,
};
use crate::audio_bridge::multichannel_types::{
    ChannelBridgeCandidate, MultichannelBridgeCandidates, MultichannelBridgeConfig,
    MultichannelBridgeStatus,
};
use crate::audio_bridge::types::{BridgeCandidate, BridgeState};
use crate::audio_bridge::multichannel_worker::{
    run_multichannel_bridge_worker, MultichannelWorkerArgs,
};

static MULTICHANNEL: OnceLock<Mutex<MultichannelBridgeManager>> = OnceLock::new();

fn global() -> &'static Mutex<MultichannelBridgeManager> {
    MULTICHANNEL.get_or_init(|| Mutex::new(MultichannelBridgeManager { worker: None }))
}

struct MultichannelBridgeManager {
    worker: Option<MultichannelWorkerState>,
}

struct MultichannelWorkerState {
    stop_flag: Arc<AtomicBool>,
    done_flag: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    shared_status: Arc<Mutex<MultichannelBridgeStatus>>,
}

#[derive(Debug, Clone)]
pub struct ResolvedMultichannelStart {
    pub config: MultichannelBridgeConfig,
    pub output_name: String,
    pub general_name: String,
}

pub fn multichannel_bridge_start(
    config: MultichannelBridgeConfig,
) -> Result<MultichannelBridgeStatus, String> {
    let mut manager = global().lock().unwrap_or_else(|p| p.into_inner());

    if manager.worker.is_some() {
        return Err("Multi-channel bridge is already running. Stop it first.".to_string());
    }

    let stop_flag = Arc::new(AtomicBool::new(false));
    let done_flag = Arc::new(AtomicBool::new(false));
    let mut initial_status = MultichannelBridgeStatus::default();
    initial_status.state = BridgeState::Starting;
    initial_status.auto_started = config.auto_started;
    initial_status.updated_at = chrono::Utc::now().to_rfc3339();

    let shared_status = Arc::new(Mutex::new(initial_status.clone()));
    let args = MultichannelWorkerArgs {
        config,
        stop_flag: stop_flag.clone(),
        done_flag: done_flag.clone(),
        shared_status: shared_status.clone(),
    };

    let handle = std::thread::Builder::new()
        .name("audapp-multichannel-bridge-worker".to_string())
        .spawn(move || run_multichannel_bridge_worker(args))
        .map_err(|error| format!("Failed to spawn multi-channel bridge worker: {error}"))?;

    manager.worker = Some(MultichannelWorkerState {
        stop_flag,
        done_flag,
        thread: Some(handle),
        shared_status,
    });

    Ok(initial_status)
}

pub fn multichannel_bridge_stop() -> MultichannelBridgeStatus {
    let mut manager = global().lock().unwrap_or_else(|p| p.into_inner());

    let Some(worker) = manager.worker.take() else {
        return stopped_status();
    };

    worker.stop_flag.store(true, Ordering::Relaxed);

    if let Ok(mut status) = worker.shared_status.lock() {
        status.state = BridgeState::Stopping;
        status.updated_at = chrono::Utc::now().to_rfc3339();
    }

    if let Some(thread) = worker.thread {
        let _ = thread.join();
    }

    let mut status = worker
        .shared_status
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone();
    if status.state == BridgeState::Stopping {
        status.state = BridgeState::Stopped;
    }
    status.updated_at = chrono::Utc::now().to_rfc3339();
    status
}

pub fn multichannel_bridge_status() -> MultichannelBridgeStatus {
    let manager = global().lock().unwrap_or_else(|p| p.into_inner());

    let Some(worker) = &manager.worker else {
        return stopped_status();
    };

    if worker.done_flag.load(Ordering::Relaxed) {
        let mut status = worker
            .shared_status
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone();
        if status.state == BridgeState::Running {
            status.state = BridgeState::Stopped;
            status.running = false;
        }
        status.updated_at = chrono::Utc::now().to_rfc3339();
        return status;
    }

    let mut status = worker
        .shared_status
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone();
    status.updated_at = chrono::Utc::now().to_rfc3339();
    status
}

pub fn multichannel_bridge_shutdown() {
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

pub fn multichannel_bridge_list_candidates() -> Result<MultichannelBridgeCandidates, String> {
    let snapshot = capture_discovery_snapshot();
    let resolved = resolve_audapp_render_endpoints_from_devices(&snapshot.devices);

    let mut channel_outputs = Vec::new();
    for (channel_id, endpoint) in [
        ("general", resolved.general.as_ref()),
        ("music", resolved.music.as_ref()),
        ("game", resolved.game.as_ref()),
        ("browser", resolved.browser.as_ref()),
    ] {
        if let Some(endpoint) = endpoint {
            channel_outputs.push(ChannelBridgeCandidate {
                channel_id: channel_id.to_string(),
                id: endpoint.id.clone(),
                name: endpoint.name.clone(),
                is_default: endpoint.is_default,
            });
        }
    }

    let physical_outputs = physical_output_endpoints_from_devices(&snapshot.devices)
        .into_iter()
        .map(|endpoint| BridgeCandidate {
            id: endpoint.id,
            name: endpoint.name,
            is_default: endpoint.is_default,
        })
        .collect();

    let legacy_input = resolved.legacy_input.map(|endpoint| BridgeCandidate {
        id: endpoint.id,
        name: endpoint.name,
        is_default: endpoint.is_default,
    });

    Ok(MultichannelBridgeCandidates {
        channel_outputs,
        physical_outputs,
        legacy_input,
    })
}

pub fn resolve_multichannel_start(
    preferred_output_id: Option<&str>,
    auto_started: bool,
) -> Result<ResolvedMultichannelStart, String> {
    let snapshot = capture_discovery_snapshot();
    resolve_multichannel_start_from_devices(&snapshot.devices, preferred_output_id, auto_started)
}

pub fn resolve_multichannel_start_from_devices(
    devices: &[AudioDiscoveryDevice],
    preferred_output_id: Option<&str>,
    auto_started: bool,
) -> Result<ResolvedMultichannelStart, String> {
    let resolved = resolve_audapp_render_endpoints_from_devices(devices);
    require_multichannel_endpoints(&resolved)
        .map_err(|error| format!("Missing required AudappChannels endpoint: {}", match error {
            crate::audio_bridge::EndpointResolutionError::MissingChannel(channel_id) => channel_id,
        }))?;

    let output = if let Some(device_id) = preferred_output_id {
        find_active_output_device_by_id(devices, device_id)
            .ok_or_else(|| "Selected physical output is not an active non-Audapp endpoint.".to_string())?
    } else {
        // No explicit selection: resolve the first active non-Audapp render endpoint.
        // The bridge mix must never be rendered to an Audapp endpoint.
        resolve_physical_output_candidate(devices, None, None, None)?
    };

    let general = resolved
        .general
        .ok_or_else(|| "Audapp General endpoint is unavailable.".to_string())?;
    let music = resolved
        .music
        .ok_or_else(|| "Audapp Music endpoint is unavailable.".to_string())?;
    let game = resolved
        .game
        .ok_or_else(|| "Audapp Game endpoint is unavailable.".to_string())?;
    let browser = resolved
        .browser
        .ok_or_else(|| "Audapp Browser endpoint is unavailable.".to_string())?;

    Ok(ResolvedMultichannelStart {
        config: MultichannelBridgeConfig {
            general_endpoint_id: general.id,
            music_endpoint_id: music.id,
            game_endpoint_id: game.id,
            browser_endpoint_id: browser.id,
            output_endpoint_id: output.id,
            auto_started,
        },
        output_name: output.name,
        general_name: general.name,
    })
}

pub fn preferred_non_audapp_output_id() -> Option<String> {
    let snapshot = capture_discovery_snapshot();
    let physical_outputs = physical_output_endpoints_from_devices(&snapshot.devices);
    physical_outputs
        .iter()
        .find(|device| device.is_default)
        .or_else(|| physical_outputs.first())
        .map(|device| device.id.clone())
}

pub fn multichannel_bridge_is_running() -> bool {
    global()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .worker
        .is_some()
}

fn stopped_status() -> MultichannelBridgeStatus {
    MultichannelBridgeStatus {
        updated_at: chrono::Utc::now().to_rfc3339(),
        ..Default::default()
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
                "legacy-input-id",
                "Hoparlor (Audapp Input)",
                false,
                Some("input"),
                None,
            ),
            output_device(
                "speaker-id",
                "Speakers (High Definition Audio Device)",
                true,
                None,
                None,
            ),
        ]
    }

    #[test]
    fn chooses_default_non_audapp_output_and_general_endpoint() {
        let resolved =
            resolve_multichannel_start_from_devices(&baseline_devices(), None, false).expect("resolved");

        assert_eq!(resolved.config.general_endpoint_id, "general-id");
        assert_eq!(resolved.general_name, "Hoparlor (Audapp General)");
        assert_eq!(resolved.config.output_endpoint_id, "speaker-id");
        assert_eq!(
            resolved.output_name,
            "Speakers (High Definition Audio Device)"
        );
    }

    #[test]
    fn refuses_when_required_channel_is_missing() {
        let mut devices = baseline_devices();
        devices.retain(|device| device.audapp_channel_id.as_deref() != Some("browser"));

        let error =
            resolve_multichannel_start_from_devices(&devices, None, false).expect_err("missing browser");

        assert!(error.contains("browser"), "{error}");
    }

    #[test]
    fn refuses_when_selected_output_is_audapp_endpoint() {
        let error = resolve_multichannel_start_from_devices(
            &baseline_devices(),
            Some("browser-id"),
            false,
        )
        .expect_err("audapp output rejected");

        assert_eq!(
            error,
            "Selected physical output is not an active non-Audapp endpoint."
        );
    }
}
