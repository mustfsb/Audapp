use windows::core::HRESULT;
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

use super::errors::AudioDiscoveryError;

const RPC_E_CHANGED_MODE: HRESULT = HRESULT(0x80010106u32 as i32);

pub fn with_com<T, F>(operation: F) -> Result<T, AudioDiscoveryError>
where
    F: FnOnce() -> Result<T, AudioDiscoveryError>,
{
    let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };

    let should_uninitialize = if hr.is_ok() {
        true
    } else if hr == RPC_E_CHANGED_MODE {
        false
    } else {
        return Err(AudioDiscoveryError::new(
            format!("Failed to initialize COM: {hr}"),
            "com_init",
        ));
    };

    let result = operation();

    if should_uninitialize {
        unsafe {
            CoUninitialize();
        }
    }

    result
}
