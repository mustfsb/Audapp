use tauri::Manager;

use crate::audio_policy::{
    clear_output_preference, get_output_preferences_status, routing_disable, routing_enable,
    routing_get_status, set_output_preference, OutputPreferencesStatus, RoutingStatus,
};

#[tauri::command]
pub fn routing_get_status_cmd() -> RoutingStatus {
    routing_get_status()
}

#[tauri::command]
pub fn routing_enable_system(output_endpoint_id: String) -> Result<RoutingStatus, String> {
    routing_enable(output_endpoint_id)
}

#[tauri::command]
pub fn routing_disable_system() -> RoutingStatus {
    routing_disable()
}

#[tauri::command]
pub fn get_output_preferences_status_cmd() -> OutputPreferencesStatus {
    get_output_preferences_status()
}

#[tauri::command]
pub fn set_output_preference_cmd(
    app: tauri::AppHandle,
    slot: String,
    output_endpoint_id: String,
) -> Result<OutputPreferencesStatus, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Unable to resolve app data dir: {error}"))?;
    set_output_preference(&data_dir, &slot, &output_endpoint_id)
}

#[tauri::command]
pub fn clear_output_preference_cmd(
    app: tauri::AppHandle,
    slot: String,
) -> Result<OutputPreferencesStatus, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Unable to resolve app data dir: {error}"))?;
    clear_output_preference(&data_dir, &slot)
}
