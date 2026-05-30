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

        return Ok(sessions);
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
