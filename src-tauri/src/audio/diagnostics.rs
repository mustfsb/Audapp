use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioEndpointDiagnostic {
    pub id: String,
    pub friendly_name: String,
    pub data_flow: String,
    pub state: String,
    pub is_default_render: bool,
    pub is_default_capture: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointProbeResult {
    pub endpoint_id: String,
    pub friendly_name: String,
    pub data_flow: String,
    pub state: String,
    pub mix_format: Option<String>,
    pub default_period_100ns: Option<i64>,
    pub min_period_100ns: Option<i64>,
    pub activate_ok: bool,
    pub initialize_ok: bool,
    pub start_ok: bool,
    pub stop_ok: bool,
    pub error: Option<String>,
}

pub fn enumerate_endpoint_diagnostics() -> Result<Vec<AudioEndpointDiagnostic>, String> {
    #[cfg(windows)]
    {
        return enumerate_endpoint_diagnostics_windows();
    }

    #[cfg(not(windows))]
    {
        Err("Windows only".to_string())
    }
}

pub fn probe_endpoint(endpoint_id: String) -> EndpointProbeResult {
    #[cfg(windows)]
    {
        return probe_endpoint_windows(endpoint_id);
    }

    #[cfg(not(windows))]
    {
        EndpointProbeResult {
            endpoint_id,
            friendly_name: String::new(),
            data_flow: "unknown".to_string(),
            state: "unknown".to_string(),
            mix_format: None,
            default_period_100ns: None,
            min_period_100ns: None,
            activate_ok: false,
            initialize_ok: false,
            start_ok: false,
            stop_ok: false,
            error: Some("Windows only".to_string()),
        }
    }
}

#[cfg(windows)]
use windows::core::{Interface, PWSTR};
#[cfg(windows)]
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
#[cfg(windows)]
use windows::Win32::Media::Audio::{
    eCapture, eMultimedia, eRender, IAudioClient, IMMDevice, IMMDeviceEnumerator, IMMEndpoint,
    MMDeviceEnumerator, AUDCLNT_SHAREMODE_SHARED, DEVICE_STATE_ACTIVE, DEVICE_STATE_DISABLED,
    DEVICE_STATE_NOTPRESENT, DEVICE_STATE_UNPLUGGED, WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
};
#[cfg(windows)]
use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;
#[cfg(windows)]
use windows::Win32::System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_ALL, STGM_READ};

#[cfg(windows)]
const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
#[cfg(windows)]
const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;
#[cfg(windows)]
const SUBTYPE_IEEE_FLOAT: windows::core::GUID = windows::core::GUID::from_values(
    0x00000003,
    0x0000,
    0x0010,
    [0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71],
);

#[cfg(windows)]
fn pwstr_to_string_and_free(pwstr: PWSTR) -> String {
    if pwstr.is_null() {
        return String::new();
    }
    let s = unsafe {
        let mut length = 0usize;
        while *pwstr.0.add(length) != 0 {
            length += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(pwstr.0, length))
    };
    unsafe { CoTaskMemFree(Some(pwstr.0 as _)) };
    s
}

#[cfg(windows)]
fn map_state(state: u32) -> String {
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
fn get_default_id(
    enumerator: &IMMDeviceEnumerator,
    flow: windows::Win32::Media::Audio::EDataFlow,
) -> Option<String> {
    let device = unsafe { enumerator.GetDefaultAudioEndpoint(flow, eMultimedia).ok()? };
    let id_pwstr = unsafe { device.GetId().ok()? };
    Some(pwstr_to_string_and_free(id_pwstr))
}

#[cfg(windows)]
fn read_friendly_name_diag(device: &IMMDevice) -> String {
    unsafe {
        let store = match device.OpenPropertyStore(STGM_READ) {
            Ok(s) => s,
            Err(_) => return "Unknown".to_string(),
        };
        let value = match store.GetValue(&PKEY_Device_FriendlyName) {
            Ok(v) => v,
            Err(_) => return "Unknown".to_string(),
        };
        let text = match PropVariantToStringAlloc(&value) {
            Ok(t) => t,
            Err(_) => return "Unknown".to_string(),
        };
        let name = pwstr_to_string_and_free(text);
        if name.is_empty() {
            "Unknown".to_string()
        } else {
            name
        }
    }
}

#[cfg(windows)]
fn enumerate_endpoint_diagnostics_windows() -> Result<Vec<AudioEndpointDiagnostic>, String> {
    use super::errors::AudioDiscoveryError;

    super::com::with_com(|| {
        let enumerator: IMMDeviceEnumerator = unsafe {
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| {
                AudioDiscoveryError::new(
                    format!("Failed to create IMMDeviceEnumerator: {e}"),
                    "device_enumerator",
                )
            })?
        };

        let default_render_id = get_default_id(&enumerator, eRender);
        let default_capture_id = get_default_id(&enumerator, eCapture);

        let mut results: Vec<AudioEndpointDiagnostic> = Vec::new();

        for (flow, flow_str) in &[(eRender, "render"), (eCapture, "capture")] {
            let collection = unsafe {
                enumerator
                    .EnumAudioEndpoints(
                        *flow,
                        windows::Win32::Media::Audio::DEVICE_STATE(
                            DEVICE_STATE_ACTIVE.0
                                | DEVICE_STATE_DISABLED.0
                                | DEVICE_STATE_NOTPRESENT.0
                                | DEVICE_STATE_UNPLUGGED.0,
                        ),
                    )
                    .map_err(|e| {
                        AudioDiscoveryError::new(
                            format!("Failed to enumerate {flow_str} endpoints: {e}"),
                            "enum_endpoints",
                        )
                    })?
            };

            let count = unsafe {
                collection.GetCount().map_err(|e| {
                    AudioDiscoveryError::new(
                        format!("Failed to get endpoint count: {e}"),
                        "endpoint_count",
                    )
                })?
            };

            for i in 0..count {
                let device = match unsafe { collection.Item(i) } {
                    Ok(d) => d,
                    Err(_) => continue,
                };

                let id_pwstr = match unsafe { device.GetId() } {
                    Ok(p) => p,
                    Err(_) => continue,
                };
                let id = pwstr_to_string_and_free(id_pwstr);

                let friendly_name = read_friendly_name_diag(&device);

                let state_raw = match unsafe { device.GetState() } {
                    Ok(s) => s.0,
                    Err(_) => 0,
                };
                let state = map_state(state_raw);

                let is_default_render = default_render_id.as_deref().map_or(false, |def| def == id);
                let is_default_capture =
                    default_capture_id.as_deref().map_or(false, |def| def == id);

                results.push(AudioEndpointDiagnostic {
                    id,
                    friendly_name,
                    data_flow: flow_str.to_string(),
                    state,
                    is_default_render,
                    is_default_capture,
                });
            }
        }

        Ok(results)
    })
    .map_err(|e| e.message)
}

#[cfg(windows)]
fn probe_endpoint_windows(endpoint_id: String) -> EndpointProbeResult {
    use super::errors::AudioDiscoveryError;

    let mut result = EndpointProbeResult {
        endpoint_id: endpoint_id.clone(),
        friendly_name: String::new(),
        data_flow: "unknown".to_string(),
        state: "unknown".to_string(),
        mix_format: None,
        default_period_100ns: None,
        min_period_100ns: None,
        activate_ok: false,
        initialize_ok: false,
        start_ok: false,
        stop_ok: false,
        error: None,
    };

    let probe_result: Result<(), AudioDiscoveryError> = super::com::with_com(|| {
        let enumerator: IMMDeviceEnumerator = unsafe {
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| {
                AudioDiscoveryError::new(
                    format!("Failed to create IMMDeviceEnumerator: {e}"),
                    "device_enumerator",
                )
            })?
        };

        let hid = windows::core::HSTRING::from(endpoint_id.as_str());
        let device: IMMDevice = unsafe {
            enumerator.GetDevice(&hid).map_err(|e| {
                AudioDiscoveryError::new(format!("Device not found: {e}"), "get_device")
            })?
        };

        result.friendly_name = read_friendly_name_diag(&device);

        let state_raw = unsafe { device.GetState().map(|s| s.0).unwrap_or(0) };
        result.state = map_state(state_raw);

        // Get data flow via IMMEndpoint
        if let Ok(endpoint) = device.cast::<IMMEndpoint>() {
            if let Ok(flow) = unsafe { endpoint.GetDataFlow() } {
                if flow == eRender {
                    result.data_flow = "render".to_string();
                } else if flow == eCapture {
                    result.data_flow = "capture".to_string();
                }
            }
        }

        // Activate IAudioClient
        let audio_client: IAudioClient =
            match unsafe { device.Activate::<IAudioClient>(CLSCTX_ALL, None) } {
                Ok(c) => {
                    result.activate_ok = true;
                    c
                }
                Err(e) => {
                    return Err(AudioDiscoveryError::new(
                        format!("Activate failed: {e}"),
                        "activate",
                    ));
                }
            };

        // GetMixFormat
        let mix_fmt_ptr: *mut WAVEFORMATEX = match unsafe { audio_client.GetMixFormat() } {
            Ok(p) => p,
            Err(e) => {
                return Err(AudioDiscoveryError::new(
                    format!("GetMixFormat failed: {e}"),
                    "get_mix_format",
                ));
            }
        };

        if mix_fmt_ptr.is_null() {
            return Err(AudioDiscoveryError::new(
                "GetMixFormat returned null".to_string(),
                "mix_format_null",
            ));
        }

        let (sample_rate, channels, bits_per_sample, is_float) = unsafe {
            let wfx = &*mix_fmt_ptr;
            let sr = wfx.nSamplesPerSec;
            let ch = wfx.nChannels;
            let bits = wfx.wBitsPerSample;
            let float = if wfx.wFormatTag == WAVE_FORMAT_IEEE_FLOAT {
                true
            } else if wfx.wFormatTag == WAVE_FORMAT_EXTENSIBLE {
                let ext_ptr = mix_fmt_ptr as *const WAVEFORMATEXTENSIBLE;
                let sub_format = std::ptr::read_unaligned(std::ptr::addr_of!((*ext_ptr).SubFormat));
                sub_format == SUBTYPE_IEEE_FLOAT
            } else {
                false
            };
            (sr, ch, bits, float)
        };

        let format_type = if is_float {
            "float".to_string()
        } else {
            "PCM".to_string()
        };
        result.mix_format = Some(format!(
            "{}Hz {}ch {}-bit {}",
            sample_rate, channels, bits_per_sample, format_type
        ));

        // GetDevicePeriod
        let mut default_period: i64 = 0;
        let mut min_period: i64 = 0;
        let _ = unsafe {
            audio_client.GetDevicePeriod(Some(&mut default_period), Some(&mut min_period))
        };
        result.default_period_100ns = Some(default_period);
        result.min_period_100ns = Some(min_period);

        // Initialize
        const BUFFER_DURATION_100NS: i64 = 1_000_000; // 100ms
        let init_result = unsafe {
            audio_client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                0,
                BUFFER_DURATION_100NS,
                0,
                mix_fmt_ptr,
                None,
            )
        };

        unsafe { CoTaskMemFree(Some(mix_fmt_ptr as *const _ as _)) };

        match init_result {
            Ok(()) => {
                result.initialize_ok = true;
            }
            Err(e) => {
                return Err(AudioDiscoveryError::new(
                    format!("Initialize failed: {e}"),
                    "initialize",
                ));
            }
        }

        // Start
        match unsafe { audio_client.Start() } {
            Ok(()) => {
                result.start_ok = true;
            }
            Err(e) => {
                return Err(AudioDiscoveryError::new(
                    format!("Start failed: {e}"),
                    "start",
                ));
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(200));

        // Stop
        match unsafe { audio_client.Stop() } {
            Ok(()) => {
                result.stop_ok = true;
            }
            Err(e) => {
                result.error = Some(format!("Stop failed: {e}"));
            }
        }

        Ok(())
    });

    if let Err(e) = probe_result {
        if result.error.is_none() {
            result.error = Some(e.message);
        }
    }

    result
}
