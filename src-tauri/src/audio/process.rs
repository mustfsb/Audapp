use std::path::Path;

use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE, MAX_PATH};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
};

pub fn resolve_process_metadata(process_id: u32) -> (Option<String>, Option<String>) {
    if process_id == 0 {
        return (None, None);
    }

    unsafe {
        let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) {
            Ok(handle) => handle,
            Err(_) => return (None, None),
        };

        let result = query_process_paths(handle);
        let _ = CloseHandle(handle);
        result
    }
}

unsafe fn query_process_paths(handle: HANDLE) -> (Option<String>, Option<String>) {
    let mut buffer = [0u16; MAX_PATH as usize];
    let mut size = buffer.len() as u32;

    let Ok(()) = QueryFullProcessImageNameW(
        handle,
        PROCESS_NAME_FORMAT(0),
        PWSTR(buffer.as_mut_ptr()),
        &mut size,
    ) else {
        return (None, None);
    };

    let executable_path = String::from_utf16_lossy(&buffer[..size as usize]);
    if executable_path.is_empty() {
        return (None, None);
    }

    let process_name = Path::new(&executable_path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string);

    (process_name, Some(executable_path))
}
