mod audio;
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::get_audio_engine_status,
            commands::get_audio_discovery_snapshot,
            commands::set_audio_session_volume,
            commands::set_audio_session_mute,
            commands::get_channel_assignments,
            commands::set_channel_assignment,
            commands::remove_channel_assignment,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
