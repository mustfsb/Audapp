/// Windows default audio endpoint setter via the undocumented IPolicyConfig COM interface.
///
/// IPolicyConfig is present in mmdevapi.dll on Windows Vista through Windows 11.
/// It is not part of the public Windows SDK, but is widely used by audio tools
/// (EarTrumpet, VoiceMeeter, SoundVolumeView, NirSoft Audio tools, etc.).
///
/// GUIDs (Windows 10 / Windows 11):
///   CLSID PolicyConfigClient: {870af99c-171d-4f9e-af0d-e63df40c2bc9}
///   IID  IPolicyConfig:        {f8679f50-850a-41cf-9c72-430f290290c8}
///
/// SetDefaultEndpoint vtable index: 10 (0-based from IUnknown)
///   [0] QueryInterface  [1] AddRef  [2] Release
///   [3] GetMixFormat  [4] GetDevicePeriod  [5] GetHardwareDeviceMixFormat
///   [6] InitializeEndpointVolume  [7] SetEndpointVisibility
///   [8] SetEndpointDefaultRoles   [9] SetEndpointVolumeLevels
///   [10] SetDefaultEndpoint

/// Set the Windows default render endpoint for all roles (eConsole/eMultimedia/eCommunications).
pub fn set_default_render_endpoint(device_id: &str) -> Result<(), String> {
    #[cfg(windows)]
    return set_default_render_endpoint_windows(device_id);
    #[cfg(not(windows))]
    Err("Platform not supported.".into())
}

#[cfg(windows)]
fn set_default_render_endpoint_windows(device_id: &str) -> Result<(), String> {
    use core::ffi::c_void;
    use windows::core::{Interface, GUID, HRESULT, HSTRING, PCWSTR};
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

    const CLSID_POLICY_CONFIG_CLIENT: GUID = GUID::from_values(
        0x870af99c,
        0x171d,
        0x4f9e,
        [0xaf, 0x0d, 0xe6, 0x3d, 0xf4, 0x0c, 0x2b, 0xc9],
    );
    const IID_IPOLICY_CONFIG: GUID = GUID::from_values(
        0xf8679f50,
        0x850a,
        0x41cf,
        [0x9c, 0x72, 0x43, 0x0f, 0x29, 0x02, 0x90, 0xc8],
    );

    unsafe {
        // Create the PolicyConfigClient COM object, asking for IUnknown
        let unk: windows::core::IUnknown =
            CoCreateInstance(&CLSID_POLICY_CONFIG_CLIENT, None, CLSCTX_ALL)
                .map_err(|e| format!("PolicyConfigClient: CoCreateInstance failed: {e}"))?;

        // QueryInterface for IPolicyConfig using raw vtable (avoids defining the interface)
        type QueryInterfaceFn = unsafe extern "system" fn(
            this: *mut c_void,
            riid: *const GUID,
            ppv: *mut *mut c_void,
        ) -> HRESULT;

        let unk_raw = unk.as_raw() as *mut *const *const ();
        let qi: QueryInterfaceFn = core::mem::transmute(*(*unk_raw));
        let mut policy_ptr: *mut c_void = core::ptr::null_mut();
        let hr = qi(
            unk.as_raw() as *mut c_void,
            &IID_IPOLICY_CONFIG,
            &mut policy_ptr,
        );
        hr.ok()
            .map_err(|e| format!("IPolicyConfig: QueryInterface failed: {e}"))?;

        if policy_ptr.is_null() {
            return Err(
                "IPolicyConfig: QueryInterface returned null — not supported on this Windows build."
                    .into(),
            );
        }

        // SetDefaultEndpoint at vtable index 10 (see vtable layout above)
        type SetDefaultEndpointFn = unsafe extern "system" fn(
            this: *mut c_void,
            device_id: PCWSTR,
            role: i32, // ERole: 0=eConsole, 1=eMultimedia, 2=eCommunications
        ) -> HRESULT;
        type ReleaseFn = unsafe extern "system" fn(this: *mut c_void) -> u32;

        let vtable = *(policy_ptr as *mut *const *const ());
        let set_default: SetDefaultEndpointFn = core::mem::transmute(*vtable.add(10));
        let release: ReleaseFn = core::mem::transmute(*vtable.add(2));

        let hid = HSTRING::from(device_id);
        let pcwstr = PCWSTR(hid.as_ptr());

        // Set for all three roles
        let mut err: Option<String> = None;
        for role in [0i32, 1, 2] {
            let hr = set_default(policy_ptr, pcwstr, role);
            if !hr.is_ok() {
                err = Some(format!(
                    "SetDefaultEndpoint(role={role}): {}",
                    windows::core::Error::from(hr)
                ));
                break;
            }
        }

        release(policy_ptr);

        if let Some(e) = err {
            return Err(e);
        }
        Ok(())
    }
}
