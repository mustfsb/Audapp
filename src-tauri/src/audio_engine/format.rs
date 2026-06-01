use crate::audio_engine::types::DeviceFormatInfo;

const WAVE_FORMAT_PCM: u16 = 1;
const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;

#[cfg(windows)]
use windows::Win32::Media::Audio::{
    eCapture, eRender, IAudioClient, IMMDeviceEnumerator, MMDeviceEnumerator,
    WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
};
#[cfg(windows)]
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    COINIT_MULTITHREADED,
};

#[cfg(windows)]
const SUBTYPE_IEEE_FLOAT: windows::core::GUID = windows::core::GUID::from_values(
    0x00000003,
    0x0000,
    0x0010,
    [0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71],
);

/// Look up mix format for a device id from the last probe list.
pub fn find_device_format(device_id: &str) -> Option<DeviceFormatInfo> {
    probe_device_formats()
        .into_iter()
        .find(|d| d.device_id == device_id)
}

pub fn probe_device_formats() -> Vec<DeviceFormatInfo> {
    #[cfg(windows)]
    {
        return probe_formats_windows();
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

#[cfg(windows)]
fn probe_formats_windows() -> Vec<DeviceFormatInfo> {
    use windows::core::HRESULT;
    const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106u32 as i32);

    let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let should_uninit = hr.is_ok() || {
        if hr == RPC_E_CHANGED_MODE {
            false
        } else {
            return Vec::new();
        }
    };

    let result = collect_formats();

    if should_uninit {
        unsafe { CoUninitialize() };
    }

    result
}

#[cfg(windows)]
fn collect_formats() -> Vec<DeviceFormatInfo> {
    let Ok(enumerator) = (unsafe {
        CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
    }) else {
        return Vec::new();
    };

    let mut results = Vec::new();

    for (data_flow, kind) in [(eRender, "output"), (eCapture, "input")] {
        if let Some(infos) = probe_endpoints(&enumerator, data_flow, kind) {
            results.extend(infos);
        }
    }

    results
}

#[cfg(windows)]
fn probe_endpoints(
    enumerator: &IMMDeviceEnumerator,
    data_flow: windows::Win32::Media::Audio::EDataFlow,
    kind: &str,
) -> Option<Vec<DeviceFormatInfo>> {
    use windows::Win32::Media::Audio::{
        DEVICE_STATE_ACTIVE, DEVICE_STATE,
    };

    let collection = unsafe {
        enumerator
            .EnumAudioEndpoints(data_flow, DEVICE_STATE(DEVICE_STATE_ACTIVE.0))
            .ok()?
    };

    let count = unsafe { collection.GetCount().ok()? };
    let mut results = Vec::new();

    for i in 0..count {
        let Ok(device) = (unsafe { collection.Item(i) }) else {
            continue;
        };

        let Ok(id_pwstr) = (unsafe { device.GetId() }) else {
            continue;
        };
        let device_id = pwstr_to_string(id_pwstr);

        let device_name = read_friendly_name(&device).unwrap_or_else(|| "Unknown device".to_string());

        let Ok(audio_client) = (unsafe { device.Activate::<IAudioClient>(CLSCTX_ALL, None) }) else {
            continue;
        };

        let Ok(mix_fmt_ptr) = (unsafe { audio_client.GetMixFormat() }) else {
            continue;
        };

        if mix_fmt_ptr.is_null() {
            continue;
        }

        let (sample_rate, channels, bits_per_sample, is_float) =
            unsafe { parse_format(mix_fmt_ptr) };

        unsafe { CoTaskMemFree(Some(mix_fmt_ptr as *const _ as _)) };

        results.push(DeviceFormatInfo {
            device_id,
            device_name,
            kind: kind.to_string(),
            sample_rate,
            channels,
            bits_per_sample,
            is_float,
        });
    }

    Some(results)
}

#[cfg(windows)]
unsafe fn parse_format(
    fmt: *mut WAVEFORMATEX,
) -> (Option<u32>, Option<u16>, Option<u16>, bool) {
    let wfx = &*fmt;
    let sample_rate = Some(wfx.nSamplesPerSec);
    let channels = Some(wfx.nChannels);

    if wfx.wFormatTag == WAVE_FORMAT_IEEE_FLOAT {
        (sample_rate, channels, Some(wfx.wBitsPerSample), true)
    } else if wfx.wFormatTag == WAVE_FORMAT_PCM {
        (sample_rate, channels, Some(wfx.wBitsPerSample), false)
    } else if wfx.wFormatTag == WAVE_FORMAT_EXTENSIBLE {
        let ext_ptr = fmt as *const WAVEFORMATEXTENSIBLE;
        let sub_format = std::ptr::read_unaligned(std::ptr::addr_of!((*ext_ptr).SubFormat));
        let is_float = sub_format == SUBTYPE_IEEE_FLOAT;
        (sample_rate, channels, Some(wfx.wBitsPerSample), is_float)
    } else {
        (sample_rate, channels, Some(wfx.wBitsPerSample), false)
    }
}

#[cfg(windows)]
fn read_friendly_name(device: &windows::Win32::Media::Audio::IMMDevice) -> Option<String> {
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::System::Com::{CoTaskMemFree, StructuredStorage::PropVariantToStringAlloc, STGM_READ};
    unsafe {
        let store = device.OpenPropertyStore(STGM_READ).ok()?;
        let value = store.GetValue(&PKEY_Device_FriendlyName).ok()?;
        let text = PropVariantToStringAlloc(&value).ok()?;
        let name = pwstr_to_string(text);
        CoTaskMemFree(Some(text.0 as _));
        if name.is_empty() { None } else { Some(name) }
    }
}

#[cfg(windows)]
fn pwstr_to_string(value: windows::core::PWSTR) -> String {
    if value.is_null() {
        return String::new();
    }
    unsafe {
        let mut len = 0usize;
        while *value.0.add(len) != 0 {
            len += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(value.0, len))
    }
}

pub fn is_float_format(bits_per_sample: u16, format_tag: u16) -> bool {
    format_tag == WAVE_FORMAT_IEEE_FLOAT
        || (format_tag == WAVE_FORMAT_EXTENSIBLE && bits_per_sample == 32)
}
