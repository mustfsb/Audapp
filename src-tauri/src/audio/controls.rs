#[cfg(windows)]
use windows::core::{Error as WindowsError, Interface};
#[cfg(windows)]
use windows::Win32::Media::Audio::{
    IAudioSessionControl, IAudioSessionControl2, IAudioSessionManager2,
    IMMDevice, IMMDeviceEnumerator, ISimpleAudioVolume,
};
#[cfg(windows)]
use windows::Win32::System::Com::CLSCTX_ALL;

use super::devices::create_enumerator;
use super::targeting::{match_session_candidate_index, SessionMatchCandidate, SessionMatchError};
use super::types::{AudioSessionControlResult, AudioSessionTarget};

#[cfg(windows)]
const AUDCLNT_E_DEVICE_INVALIDATED: i32 = 0x88890004u32 as i32;
#[cfg(windows)]
const DEVICE_NOT_AVAILABLE: i32 = 0xE0000225u32 as i32;
#[cfg(windows)]
const ERROR_NOT_FOUND: i32 = 0x80070490u32 as i32;


#[derive(Debug, Clone)]
pub enum SessionControlError {
    StaleTarget,
    AmbiguousTarget,
    Unsupported,
    Platform(String),
    Windows(String),
}

impl SessionControlError {
    pub fn message(&self) -> String {
        match self {
            Self::StaleTarget => {
                "The audio session is no longer available. Refresh and try again.".to_string()
            }
            Self::AmbiguousTarget => {
                "Multiple sessions matched this target. Refresh and try again.".to_string()
            }
            Self::Unsupported => {
                "This session does not support volume or mute control.".to_string()
            }
            Self::Platform(message) | Self::Windows(message) => message.clone(),
        }
    }
}

pub fn set_session_volume(
    target: AudioSessionTarget,
    volume_percent: f32,
) -> Result<AudioSessionControlResult, SessionControlError> {
    let clamped = volume_percent.clamp(0.0, 100.0);
    apply_session_control(target, SessionControlAction::Volume(clamped))
}

pub fn set_session_mute(
    target: AudioSessionTarget,
    muted: bool,
) -> Result<AudioSessionControlResult, SessionControlError> {
    apply_session_control(target, SessionControlAction::Mute(muted))
}

enum SessionControlAction {
    Volume(f32),
    Mute(bool),
}

fn apply_session_control(
    target: AudioSessionTarget,
    action: SessionControlAction,
) -> Result<AudioSessionControlResult, SessionControlError> {
    #[cfg(windows)]
    {
        return super::com::with_com(|| {
            let (requested_volume, requested_muted, warning) = match &action {
                SessionControlAction::Volume(percent) => {
                    let level = percent / 100.0;
                    apply_on_matched_session(&target, |simple_volume| {
                        unsafe {
                            simple_volume
                                .SetMasterVolume(level, std::ptr::null())
                                .map_err(|error| SessionControlError::Windows(error.to_string()))
                        }
                    })
                    .map_err(|error| {
                        super::errors::AudioDiscoveryError::new(error.message(), "session_control")
                    })?;
                    (Some(*percent), None, None)
                }
                SessionControlAction::Mute(muted) => {
                    apply_on_matched_session(&target, |simple_volume| {
                        unsafe {
                            simple_volume
                                .SetMute(*muted, std::ptr::null())
                                .map_err(|error| SessionControlError::Windows(error.to_string()))
                        }
                    })
                    .map_err(|error| {
                        super::errors::AudioDiscoveryError::new(error.message(), "session_control")
                    })?;
                    (None, Some(*muted), None)
                }
            };

            let snapshot = Some(super::capture_discovery_snapshot());

            Ok(AudioSessionControlResult {
                ok: true,
                target,
                requested_volume,
                requested_muted,
                message: Some("Session control applied.".to_string()),
                warning,
                snapshot,
            })
        })
        .map_err(|error| SessionControlError::Platform(error.message));
    }

    #[cfg(not(windows))]
    {
        let _ = (target, action);
        Err(SessionControlError::Platform(
            "Session control requires Windows.".to_string(),
        ))
    }
}

fn failure_result(
    target: AudioSessionTarget,
    error: SessionControlError,
    requested_volume: Option<f32>,
    requested_muted: Option<bool>,
) -> AudioSessionControlResult {
    #[cfg(windows)]
    let snapshot = Some(super::capture_discovery_snapshot());
    #[cfg(not(windows))]
    let snapshot = None;

    AudioSessionControlResult {
        ok: false,
        target,
        requested_volume,
        requested_muted,
        message: Some(error.message()),
        warning: None,
        snapshot,
    }
}

pub fn set_session_volume_with_snapshot(
    target: AudioSessionTarget,
    volume_percent: f32,
) -> AudioSessionControlResult {
    let clamped = volume_percent.clamp(0.0, 100.0);
    match set_session_volume(target.clone(), clamped) {
        Ok(result) => result,
        Err(error) => failure_result(target, error, Some(clamped), None),
    }
}

pub fn set_session_mute_with_snapshot(
    target: AudioSessionTarget,
    muted: bool,
) -> AudioSessionControlResult {
    match set_session_mute(target.clone(), muted) {
        Ok(result) => result,
        Err(error) => failure_result(target, error, None, Some(muted)),
    }
}

#[cfg(windows)]
fn apply_on_matched_session(
    target: &AudioSessionTarget,
    apply: impl FnOnce(&ISimpleAudioVolume) -> Result<(), SessionControlError>,
) -> Result<(), SessionControlError> {
    let enumerator = create_enumerator().map_err(|error| SessionControlError::Platform(error.message))?;
    let device = open_device(&enumerator, &target.device_id)?;

    let session_manager = activate_session_manager(&device)?;
    let session_enumerator = unsafe {
        session_manager.GetSessionEnumerator().map_err(|error| {
            SessionControlError::Windows(format!("Failed to enumerate sessions: {error}"))
        })?
    };

    let count = unsafe {
        session_enumerator
            .GetCount()
            .map_err(|error| SessionControlError::Windows(error.to_string()))?
    };

    let mut candidates = Vec::new();
    let mut session_indices = Vec::new();

    for index in 0..count {
        let Ok(control) = (unsafe { session_enumerator.GetSession(index) }) else {
            continue;
        };

        let Ok(control2) = control.cast::<IAudioSessionControl2>() else {
            continue;
        };

        let process_id = unsafe { control2.GetProcessId().unwrap_or(0) };
        let is_system_sounds = process_id == 0;
        let raw_display = read_display_name(&control);
        let display_name = resolve_session_display_name(
            raw_display.as_deref(),
            None,
            None,
            process_id,
            is_system_sounds,
        );

        candidates.push(SessionMatchCandidate {
            device_id: target.device_id.clone(),
            session_id: read_session_identifier(&control2),
            session_instance_id: read_session_instance_id(&control2),
            process_id: if is_system_sounds {
                None
            } else {
                Some(process_id)
            },
            display_name,
            is_system_sounds,
        });
        session_indices.push(index);
    }

    let matched_index = match_session_candidate_index(&candidates, target).map_err(|error| {
        match error {
            SessionMatchError::StaleTarget => SessionControlError::StaleTarget,
            SessionMatchError::AmbiguousTarget => SessionControlError::AmbiguousTarget,
        }
    })?;

    let session_index = session_indices[matched_index];
    let control = unsafe {
        session_enumerator
            .GetSession(session_index)
            .map_err(|error| SessionControlError::Windows(error.to_string()))?
    };

    let simple_volume = control.cast::<ISimpleAudioVolume>().map_err(|error| {
        if is_skippable_hresult(&error) {
            SessionControlError::Unsupported
        } else {
            SessionControlError::Windows(error.to_string())
        }
    })?;

    apply(&simple_volume)
}

#[cfg(windows)]
fn open_device(
    enumerator: &IMMDeviceEnumerator,
    device_id: &str,
) -> Result<IMMDevice, SessionControlError> {
    let id = windows::core::HSTRING::from(device_id);
    unsafe {
        enumerator
            .GetDevice(&id)
            .map_err(|_| SessionControlError::StaleTarget)
    }
}

#[cfg(windows)]
fn activate_session_manager(
    device: &IMMDevice,
) -> Result<IAudioSessionManager2, SessionControlError> {
    unsafe {
        device
            .Activate::<IAudioSessionManager2>(CLSCTX_ALL, None)
            .map_err(|_| SessionControlError::StaleTarget)
    }
}


#[cfg(windows)]
fn is_skippable_hresult(error: &WindowsError) -> bool {
    matches!(
        error.code().0,
        AUDCLNT_E_DEVICE_INVALIDATED | DEVICE_NOT_AVAILABLE | ERROR_NOT_FOUND
    )
}

#[cfg(windows)]
fn read_display_name(control: &IAudioSessionControl) -> Option<String> {
    unsafe {
        control
            .GetDisplayName()
            .ok()
            .map(|value| wide_ptr_to_string(value))
            .filter(|name| !name.is_empty())
    }
}

#[cfg(windows)]
fn read_session_identifier(control2: &IAudioSessionControl2) -> Option<String> {
    unsafe {
        control2
            .GetSessionIdentifier()
            .ok()
            .map(|value| wide_ptr_to_string(value))
            .filter(|value| !value.is_empty())
    }
}

#[cfg(windows)]
fn read_session_instance_id(control2: &IAudioSessionControl2) -> Option<String> {
    unsafe {
        control2
            .GetSessionInstanceIdentifier()
            .ok()
            .map(|value| wide_ptr_to_string(value))
            .filter(|value| !value.is_empty())
    }
}

#[cfg(windows)]
fn wide_ptr_to_string(value: windows::core::PWSTR) -> String {
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

fn resolve_session_display_name(
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
