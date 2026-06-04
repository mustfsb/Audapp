use crate::audio_policy::{routing_disable, routing_enable, routing_get_status, RoutingStatus};

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
