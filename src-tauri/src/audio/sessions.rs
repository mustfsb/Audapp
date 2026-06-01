#[cfg(windows)]
use windows::core::{Error as WindowsError, Interface, PWSTR};
#[cfg(windows)]
use windows::Win32::Media::Audio::{
    IAudioSessionControl, IAudioSessionControl2, IAudioSessionEnumerator, IAudioSessionManager2,
    IMMDevice, IMMDeviceEnumerator, ISimpleAudioVolume, AudioSessionStateActive,
    AudioSessionStateExpired, AudioSessionStateInactive,
};
#[cfg(windows)]
use windows::Win32::System::Com::CLSCTX_ALL;

use super::devices::{active_render_device_ids, create_enumerator};
use super::errors::AudioDiscoveryError;
use super::process::resolve_process_metadata;
use super::types::{AudioDiscoveryDevice, AudioDiscoverySession};

/// HRESULTs returned for endpoints that cannot host session enumeration (disabled, HDMI w/o audio, etc.).
#[cfg(windows)]
const AUDCLNT_E_DEVICE_INVALIDATED: i32 = 0x88890004u32 as i32;
#[cfg(windows)]
const DEVICE_NOT_AVAILABLE: i32 = 0xE0000225u32 as i32;
#[cfg(windows)]
const ERROR_NOT_FOUND: i32 = 0x80070490u32 as i32;

#[cfg(windows)]
fn is_skippable_session_hresult(error: &WindowsError) -> bool {
    matches!(
        error.code().0,
        AUDCLNT_E_DEVICE_INVALIDATED | DEVICE_NOT_AVAILABLE | ERROR_NOT_FOUND
    )
}

pub fn enumerate_sessions(
    devices: &[AudioDiscoveryDevice],
    warnings: &mut Vec<String>,
) -> Result<Vec<AudioDiscoverySession>, AudioDiscoveryError> {
    #[cfg(windows)]
    {
        let enumerator = create_enumerator()?;
        let render_ids = active_render_device_ids(devices);

        let mut sessions = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();

        for device_id in render_ids {
            let Some(device) = try_open_device(&enumerator, &device_id) else {
                continue;
            };

            match read_device_sessions(&device, &device_id, warnings, &mut seen_ids) {
                Ok(mut found) => sessions.append(&mut found),
                Err(error) => warnings.push(error.message),
            }
        }

        return Ok(collapse_system_sounds_sessions(sessions, devices));
    }

    #[cfg(not(windows))]
    {
        let _ = (devices, warnings);
        Err(AudioDiscoveryError::new(
            "Session enumeration requires Windows.",
            "platform",
        ))
    }
}

#[cfg(windows)]
fn try_open_device(enumerator: &IMMDeviceEnumerator, device_id: &str) -> Option<IMMDevice> {
    let id = windows::core::HSTRING::from(device_id);
    unsafe { enumerator.GetDevice(&id).ok() }
}

#[cfg(windows)]
fn read_device_sessions(
    device: &IMMDevice,
    device_id: &str,
    warnings: &mut Vec<String>,
    seen_ids: &mut std::collections::HashSet<String>,
) -> Result<Vec<AudioDiscoverySession>, AudioDiscoveryError> {
    let Some(session_manager) = try_activate_session_manager(device) else {
        return Ok(Vec::new());
    };

    let enumerator = match unsafe { session_manager.GetSessionEnumerator() } {
        Ok(enumerator) => enumerator,
        Err(error) if is_skippable_session_hresult(&error) => return Ok(Vec::new()),
        Err(error) => {
            return Err(AudioDiscoveryError::new(
                format!("Failed to get session enumerator on {device_id}: {error}"),
                "session_enumerator",
            ));
        }
    };

    let count = unsafe {
        enumerator.GetCount().map_err(|error| {
            AudioDiscoveryError::new(
                format!("Failed to read session count: {error}"),
                "session_count",
            )
        })?
    };

    let mut sessions = Vec::new();

    for index in 0..count {
        match read_session(&enumerator, device_id, index) {
            Ok(Some(session)) => {
                if seen_ids.insert(session.id.clone()) {
                    sessions.push(session);
                }
            }
            Ok(None) => {}
            Err(error) => warnings.push(error.message),
        }
    }

    Ok(sessions)
}

#[cfg(windows)]
fn try_activate_session_manager(device: &IMMDevice) -> Option<IAudioSessionManager2> {
    unsafe {
        match device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) {
            Ok(manager) => Some(manager),
            Err(error) if is_skippable_session_hresult(&error) => None,
            Err(error) => {
                // Non-fatal: virtual/disabled endpoints may not expose a session manager.
                let _ = error;
                None
            }
        }
    }
}

#[cfg(windows)]
fn read_session(
    enumerator: &IAudioSessionEnumerator,
    device_id: &str,
    index: i32,
) -> Result<Option<AudioDiscoverySession>, AudioDiscoveryError> {
    let control = unsafe {
        enumerator.GetSession(index).map_err(|error| {
            AudioDiscoveryError::new(
                format!("Failed to read session #{index}: {error}"),
                "session_control",
            )
        })?
    };

    let control2: IAudioSessionControl2 = control.cast().map_err(|error| {
        AudioDiscoveryError::new(
            format!("Failed to cast session control: {error}"),
            "session_control2",
        )
    })?;

    let process_id = unsafe { control2.GetProcessId().unwrap_or(0) };
    let is_system_sounds = process_id == 0;

    let (process_name, executable_path) = if is_system_sounds {
        (Some("System Sounds".to_string()), None)
    } else {
        resolve_process_metadata(process_id)
    };

    let raw_display = read_display_name(&control);
    let display_name = resolve_session_display_name(
        raw_display.as_deref(),
        process_name.as_deref(),
        executable_path.as_deref(),
        process_id,
        is_system_sounds,
    );

    let state = read_session_state(&control)?;
    let (volume, muted) = read_volume_state(&control);

    let session_id = read_session_identifier(&control2);
    let session_instance_id = read_session_instance_id(&control2);
    let composite_instance = session_instance_id.clone().unwrap_or_else(|| {
        format!("{device_id}-session-{index}")
    });
    let id = format!("{device_id}::{composite_instance}");

    Ok(Some(AudioDiscoverySession {
        id,
        session_id,
        session_instance_id,
        display_name,
        process_id: if is_system_sounds {
            None
        } else {
            Some(process_id)
        },
        process_name,
        executable_path,
        device_id: Some(device_id.to_string()),
        state,
        volume,
        muted,
        is_system_sounds,
    }))
}

#[cfg(windows)]
fn read_display_name(control: &IAudioSessionControl) -> Option<String> {
    unsafe {
        control
            .GetDisplayName()
            .ok()
            .map(wide_ptr_to_string)
            .filter(|name| !name.is_empty())
    }
}

#[cfg(windows)]
fn read_session_identifier(control2: &IAudioSessionControl2) -> Option<String> {
    unsafe {
        control2
            .GetSessionIdentifier()
            .ok()
            .map(wide_ptr_to_string)
            .filter(|value| !value.is_empty())
    }
}

#[cfg(windows)]
fn read_session_instance_id(control2: &IAudioSessionControl2) -> Option<String> {
    unsafe {
        control2
            .GetSessionInstanceIdentifier()
            .ok()
            .map(wide_ptr_to_string)
            .filter(|value| !value.is_empty())
    }
}

#[cfg(windows)]
fn read_session_state(control: &IAudioSessionControl) -> Result<String, AudioDiscoveryError> {
    let state = unsafe {
        control.GetState().map_err(|error| {
            AudioDiscoveryError::new(
                format!("Failed to read session state: {error}"),
                "session_state",
            )
        })?
    };

    Ok(map_session_state(state))
}

#[cfg(windows)]
fn map_session_state(state: windows::Win32::Media::Audio::AudioSessionState) -> String {
    if state == AudioSessionStateActive {
        "active".to_string()
    } else if state == AudioSessionStateInactive {
        "inactive".to_string()
    } else if state == AudioSessionStateExpired {
        "expired".to_string()
    } else {
        "unknown".to_string()
    }
}

#[cfg(windows)]
fn read_volume_state(control: &IAudioSessionControl) -> (Option<f32>, Option<bool>) {
    let Ok(simple_volume) = control.cast::<ISimpleAudioVolume>() else {
        return (None, None);
    };

    let volume = unsafe { simple_volume.GetMasterVolume() }
        .ok()
        .map(|value| (value * 100.0).clamp(0.0, 100.0));

    let muted = unsafe { simple_volume.GetMute() }.ok().map(|value| value.as_bool());

    (volume, muted)
}

#[cfg(windows)]
fn wide_ptr_to_string(value: PWSTR) -> String {
    if value.is_null() {
        return String::new();
    }

    unsafe {
        let mut length = 0;
        while *value.0.add(length) != 0 {
            length += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(value.0, length))
    }
}

/// Resolves the best available display label for an audio session.
///
/// Priority: real display name → system sounds → process name → exe basename → PID → "Audio session".
/// Ignores Windows resource-string placeholders (names starting with `@`).
pub(super) fn resolve_session_display_name(
    raw_display_name: Option<&str>,
    process_name: Option<&str>,
    executable_path: Option<&str>,
    process_id: u32,
    is_system_sounds: bool,
) -> String {
    if let Some(name) = raw_display_name {
        let trimmed = name.trim();
        if !trimmed.is_empty() && !trimmed.starts_with('@') {
            return trimmed.to_string();
        }
    }

    if is_system_sounds || process_id == 0 {
        return "System Sounds".to_string();
    }

    if let Some(name) = process_name {
        let trimmed = name.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    if let Some(path) = executable_path {
        if let Some(basename) = std::path::Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
        {
            let trimmed = basename.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    if process_id > 0 {
        return format!("PID {process_id}");
    }

    "Audio session".to_string()
}

/// Windows exposes a separate System Sounds session on each render endpoint.
/// Keep a single row for the default output device (or best active fallback).
pub fn collapse_system_sounds_sessions(
    sessions: Vec<AudioDiscoverySession>,
    devices: &[AudioDiscoveryDevice],
) -> Vec<AudioDiscoverySession> {
    let default_output_id = devices
        .iter()
        .find(|d| d.kind == "output" && d.is_default)
        .map(|d| d.id.as_str());

    let mut app_sessions = Vec::new();
    let mut system_sessions = Vec::new();

    for session in sessions {
        if session.is_system_sounds {
            system_sessions.push(session);
        } else {
            app_sessions.push(session);
        }
    }

    if system_sessions.is_empty() {
        return app_sessions;
    }

    if let Some(chosen) = pick_system_sounds_session(&system_sessions, default_output_id) {
        app_sessions.push(chosen);
    }

    app_sessions
}

fn session_state_rank(state: &str) -> u8 {
    match state {
        "active" => 3,
        "inactive" => 2,
        "expired" => 1,
        _ => 0,
    }
}

fn pick_system_sounds_session<'a>(
    sessions: &'a [AudioDiscoverySession],
    default_output_device_id: Option<&str>,
) -> Option<AudioDiscoverySession> {
    let mut best: Option<&AudioDiscoverySession> = None;

    let mut consider = |candidate: &'a AudioDiscoverySession| {
        let prefer_default = default_output_device_id.is_some_and(|id| {
            candidate.device_id.as_deref() == Some(id)
        });
        let replace = match best {
            None => true,
            Some(current) => {
                let cand_default = default_output_device_id.is_some_and(|id| {
                    current.device_id.as_deref() == Some(id)
                });
                if prefer_default && !cand_default {
                    true
                } else if cand_default && !prefer_default {
                    false
                } else {
                    let cand_rank = session_state_rank(&candidate.state);
                    let best_rank = session_state_rank(&current.state);
                    cand_rank > best_rank
                }
            }
        };
        if replace {
            best = Some(candidate);
        }
    };

    if let Some(default_id) = default_output_device_id {
        for session in sessions {
            if session.device_id.as_deref() == Some(default_id) {
                consider(session);
            }
        }
    }

    for session in sessions {
        consider(session);
    }

    best.cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn system_session(id: &str, device_id: &str, state: &str) -> AudioDiscoverySession {
        AudioDiscoverySession {
            id: id.to_string(),
            session_id: None,
            session_instance_id: None,
            display_name: "System Sounds".to_string(),
            process_id: None,
            process_name: Some("System Sounds".to_string()),
            executable_path: None,
            device_id: Some(device_id.to_string()),
            state: state.to_string(),
            volume: Some(100.0),
            muted: Some(false),
            is_system_sounds: true,
        }
    }

    fn app_session(id: &str) -> AudioDiscoverySession {
        AudioDiscoverySession {
            id: id.to_string(),
            session_id: Some("app-session".to_string()),
            session_instance_id: None,
            display_name: "Chrome".to_string(),
            process_id: Some(1234),
            process_name: Some("chrome.exe".to_string()),
            executable_path: None,
            device_id: Some("device-a".to_string()),
            state: "active".to_string(),
            volume: Some(80.0),
            muted: Some(false),
            is_system_sounds: false,
        }
    }

    #[test]
    fn collapse_system_sounds_keeps_one_row_and_preserves_apps() {
        let devices = vec![
            AudioDiscoveryDevice {
                id: "default-out".to_string(),
                name: "Speakers".to_string(),
                kind: "output".to_string(),
                state: "active".to_string(),
                is_default: true,
            },
            AudioDiscoveryDevice {
                id: "hdmi-out".to_string(),
                name: "HDMI".to_string(),
                kind: "output".to_string(),
                state: "active".to_string(),
                is_default: false,
            },
        ];

        let sessions = vec![
            app_session("chrome"),
            system_session("sys-a", "hdmi-out", "inactive"),
            system_session("sys-b", "default-out", "active"),
            system_session("sys-c", "other-out", "active"),
        ];

        let collapsed = collapse_system_sounds_sessions(sessions, &devices);
        assert_eq!(collapsed.len(), 2);
        assert!(collapsed.iter().any(|s| s.id == "chrome"));
        let system_rows: Vec<_> = collapsed
            .iter()
            .filter(|s| s.is_system_sounds)
            .collect();
        assert_eq!(system_rows.len(), 1);
        assert_eq!(system_rows[0].id, "sys-b");
    }
}
