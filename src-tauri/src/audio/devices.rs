#[cfg(windows)]
use windows::core::PWSTR;
#[cfg(windows)]
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
#[cfg(windows)]
use windows::Win32::Media::Audio::{
    eCapture, eMultimedia, eRender, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE,
    DEVICE_STATE_ACTIVE, DEVICE_STATE_DISABLED, DEVICE_STATE_NOTPRESENT, DEVICE_STATE_UNPLUGGED,
};
#[cfg(windows)]
use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;
#[cfg(windows)]
use windows::Win32::System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_ALL, STGM_READ};

use super::errors::AudioDiscoveryError;
use super::types::AudioDiscoveryDevice;

#[cfg(windows)]
const ENDPOINT_STATE_MASK: DEVICE_STATE = DEVICE_STATE(
    DEVICE_STATE_ACTIVE.0
        | DEVICE_STATE_DISABLED.0
        | DEVICE_STATE_NOTPRESENT.0
        | DEVICE_STATE_UNPLUGGED.0,
);

pub fn enumerate_devices(warnings: &mut Vec<String>) -> Result<Vec<AudioDiscoveryDevice>, AudioDiscoveryError> {
    #[cfg(windows)]
    {
        let enumerator = create_enumerator()?;
        let default_render_id = default_device_id(&enumerator, eRender).ok();
        let default_capture_id = default_device_id(&enumerator, eCapture).ok();

        let mut devices = Vec::new();

        append_endpoints(
            &enumerator,
            eRender,
            "output",
            default_render_id.as_deref(),
            &mut devices,
            warnings,
        )?;
        append_endpoints(
            &enumerator,
            eCapture,
            "input",
            default_capture_id.as_deref(),
            &mut devices,
            warnings,
        )?;

        return Ok(devices);
    }

    #[cfg(not(windows))]
    {
        let _ = warnings;
        Err(AudioDiscoveryError::message_only(
            "Device enumeration requires Windows.",
        ))
    }
}

#[cfg(windows)]
pub(crate) fn create_enumerator() -> Result<IMMDeviceEnumerator, AudioDiscoveryError> {
    unsafe {
        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|error| {
            AudioDiscoveryError::new(
                format!("Failed to create IMMDeviceEnumerator: {error}"),
                "device_enumerator",
            )
        })
    }
}

#[cfg(windows)]
fn default_device_id(
    enumerator: &IMMDeviceEnumerator,
    data_flow: windows::Win32::Media::Audio::EDataFlow,
) -> Result<String, AudioDiscoveryError> {
    let device = unsafe {
        enumerator
            .GetDefaultAudioEndpoint(data_flow, eMultimedia)
            .map_err(|error| {
                AudioDiscoveryError::new(
                    format!("Failed to read default endpoint: {error}"),
                    "default_endpoint",
                )
            })?
    };

    read_device_id(&device)
}

#[cfg(windows)]
fn append_endpoints(
    enumerator: &IMMDeviceEnumerator,
    data_flow: windows::Win32::Media::Audio::EDataFlow,
    kind: &str,
    default_id: Option<&str>,
    devices: &mut Vec<AudioDiscoveryDevice>,
    warnings: &mut Vec<String>,
) -> Result<(), AudioDiscoveryError> {
    let collection = unsafe {
        enumerator
            .EnumAudioEndpoints(data_flow, ENDPOINT_STATE_MASK)
            .map_err(|error| {
                AudioDiscoveryError::new(
                    format!("Failed to enumerate {kind} endpoints: {error}"),
                    "enum_endpoints",
                )
            })?
    };

    let count = unsafe {
        collection.GetCount().map_err(|error| {
            AudioDiscoveryError::new(
                format!("Failed to read endpoint count: {error}"),
                "endpoint_count",
            )
        })?
    };

    for index in 0..count {
        let device = match unsafe { collection.Item(index) } {
            Ok(device) => device,
            Err(error) => {
                warnings.push(format!("Skipped {kind} endpoint #{index}: {error}"));
                continue;
            }
        };

        match read_endpoint(&device, kind, default_id) {
            Ok(endpoint) => devices.push(endpoint),
            Err(error) => warnings.push(error.message),
        }
    }

    Ok(())
}

#[cfg(windows)]
fn read_endpoint(
    device: &IMMDevice,
    kind: &str,
    default_id: Option<&str>,
) -> Result<AudioDiscoveryDevice, AudioDiscoveryError> {
    let id = read_device_id(device)?;
    let name = read_friendly_name(device).unwrap_or_else(|| "Unknown device".to_string());
    let state = read_device_state(device)?;

    Ok(AudioDiscoveryDevice {
        id: id.clone(),
        name,
        kind: kind.to_string(),
        state,
        is_default: default_id.is_some_and(|default_id| default_id == id),
    })
}

#[cfg(windows)]
fn read_device_id(device: &IMMDevice) -> Result<String, AudioDiscoveryError> {
    let id = unsafe {
        device.GetId().map_err(|error| {
            AudioDiscoveryError::new(format!("Failed to read device id: {error}"), "device_id")
        })?
    };

    Ok(wide_ptr_to_string(id))
}

#[cfg(windows)]
fn read_friendly_name(device: &IMMDevice) -> Option<String> {
    unsafe {
        let store = device.OpenPropertyStore(STGM_READ).ok()?;
        let value = store.GetValue(&PKEY_Device_FriendlyName).ok()?;
        let text = PropVariantToStringAlloc(&value).ok()?;
        let name = wide_ptr_to_string(text);
        CoTaskMemFree(Some(text.0 as _));
        if name.is_empty() {
            None
        } else {
            Some(name)
        }
    }
}

#[cfg(windows)]
fn read_device_state(device: &IMMDevice) -> Result<String, AudioDiscoveryError> {
    let state = unsafe {
        device.GetState().map_err(|error| {
            AudioDiscoveryError::new(format!("Failed to read device state: {error}"), "device_state")
        })?
    };

    Ok(map_device_state(state.0))
}

#[cfg(windows)]
fn map_device_state(state: u32) -> String {
    if state & DEVICE_STATE_ACTIVE.0 != 0 {
        "active".to_string()
    } else if state & DEVICE_STATE_DISABLED.0 != 0 {
        "disabled".to_string()
    } else if state & DEVICE_STATE_NOTPRESENT.0 != 0 {
        "not_present".to_string()
    } else if state & DEVICE_STATE_UNPLUGGED.0 != 0 {
        "unplugged".to_string()
    } else {
        "unknown".to_string()
    }
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

#[cfg(windows)]
pub fn active_render_device_ids(devices: &[AudioDiscoveryDevice]) -> Vec<String> {
    devices
        .iter()
        .filter(|device| device.kind == "output" && device.state == "active")
        .map(|device| device.id.clone())
        .collect()
}
