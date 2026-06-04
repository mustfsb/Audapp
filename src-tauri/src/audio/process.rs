use std::path::Path;

use windows::core::PWSTR;
use windows::Win32::Foundation::{
    CloseHandle, HANDLE, MAX_PATH, APPMODEL_ERROR_NO_APPLICATION, ERROR_INSUFFICIENT_BUFFER,
};
use windows::Win32::Storage::Packaging::Appx::{
    GetApplicationUserModelId, GetPackageFamilyName, GetPackageFullName,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
};

#[derive(Debug, Clone, Default)]
pub struct ProcessMetadata {
    pub process_name: Option<String>,
    pub executable_path: Option<String>,
    pub app_user_model_id: Option<String>,
    pub package_full_name: Option<String>,
    pub package_family_name: Option<String>,
}

pub fn resolve_process_metadata(process_id: u32) -> ProcessMetadata {
    if process_id == 0 {
        return ProcessMetadata::default();
    }

    unsafe {
        let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) {
            Ok(handle) => handle,
            Err(_) => return ProcessMetadata::default(),
        };

        let result = query_process_paths(handle);
        let _ = CloseHandle(handle);
        result
    }
}

unsafe fn query_process_paths(handle: HANDLE) -> ProcessMetadata {
    let mut buffer = [0u16; MAX_PATH as usize];
    let mut size = buffer.len() as u32;

    let Ok(()) = QueryFullProcessImageNameW(
        handle,
        PROCESS_NAME_FORMAT(0),
        PWSTR(buffer.as_mut_ptr()),
        &mut size,
    ) else {
        return ProcessMetadata::default();
    };

    let executable_path = String::from_utf16_lossy(&buffer[..size as usize]);
    if executable_path.is_empty() {
        return ProcessMetadata::default();
    }

    let process_name = Path::new(&executable_path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string);

    ProcessMetadata {
        process_name,
        executable_path: Some(executable_path),
        app_user_model_id: read_app_model_string(handle, read_application_user_model_id),
        package_full_name: read_app_model_string(handle, read_package_full_name),
        package_family_name: read_app_model_string(handle, read_package_family_name),
    }
}

unsafe fn read_app_model_string(
    handle: HANDLE,
    reader: unsafe fn(HANDLE, *mut u32, PWSTR) -> windows::Win32::Foundation::WIN32_ERROR,
) -> Option<String> {
    let mut length = 0u32;
    let first = reader(handle, &mut length, PWSTR::null());
    if first == APPMODEL_ERROR_NO_APPLICATION || length == 0 {
        return None;
    }
    if first != ERROR_INSUFFICIENT_BUFFER {
        return None;
    }

    let mut buffer = vec![0u16; length as usize];
    let second = reader(handle, &mut length, PWSTR(buffer.as_mut_ptr()));
    if second != windows::Win32::Foundation::WIN32_ERROR(0) || length == 0 {
        return None;
    }

    let actual_len = length.saturating_sub(1) as usize;
    let value = String::from_utf16_lossy(&buffer[..actual_len]);
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

unsafe fn read_application_user_model_id(
    handle: HANDLE,
    length: *mut u32,
    buffer: PWSTR,
) -> windows::Win32::Foundation::WIN32_ERROR {
    GetApplicationUserModelId(handle, length, buffer)
}

unsafe fn read_package_full_name(
    handle: HANDLE,
    length: *mut u32,
    buffer: PWSTR,
) -> windows::Win32::Foundation::WIN32_ERROR {
    GetPackageFullName(handle, length, buffer)
}

unsafe fn read_package_family_name(
    handle: HANDLE,
    length: *mut u32,
    buffer: PWSTR,
) -> windows::Win32::Foundation::WIN32_ERROR {
    GetPackageFamilyName(handle, length, buffer)
}
