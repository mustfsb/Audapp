use crate::voice_lab::{
    voice_list_inputs, voice_list_outputs, voice_set_settings, voice_start, voice_status,
    voice_stop, VoiceDevice, VoiceLabSettings, VoiceLabStatus,
};

#[tauri::command]
pub fn voice_list_input_devices() -> Result<Vec<VoiceDevice>, String> {
    voice_list_inputs()
}

#[tauri::command]
pub fn voice_list_monitor_outputs() -> Result<Vec<VoiceDevice>, String> {
    voice_list_outputs()
}

#[tauri::command]
pub fn voice_start_lab(settings: VoiceLabSettings) -> Result<VoiceLabStatus, String> {
    voice_start(settings)
}

#[tauri::command]
pub fn voice_stop_lab() -> VoiceLabStatus {
    voice_stop()
}

#[tauri::command]
pub fn voice_get_status() -> VoiceLabStatus {
    voice_status()
}

#[tauri::command]
pub fn voice_update_settings(settings: VoiceLabSettings) -> VoiceLabStatus {
    voice_set_settings(settings)
}
