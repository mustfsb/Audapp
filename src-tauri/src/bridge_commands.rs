use crate::audio_bridge::{
    bridge_list_candidates, bridge_start, bridge_status, bridge_stop, BridgeCandidates,
    BridgePocConfig, BridgePocStatus,
};

#[tauri::command]
pub fn start_audio_bridge_poc(config: BridgePocConfig) -> Result<BridgePocStatus, String> {
    bridge_start(config)
}

#[tauri::command]
pub fn stop_audio_bridge_poc() -> BridgePocStatus {
    bridge_stop()
}

#[tauri::command]
pub fn get_audio_bridge_status() -> BridgePocStatus {
    bridge_status()
}

#[tauri::command]
pub fn list_bridge_candidates() -> Result<BridgeCandidates, String> {
    bridge_list_candidates()
}
