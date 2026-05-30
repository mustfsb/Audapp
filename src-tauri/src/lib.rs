mod audio;
mod audio_engine;
mod audio_engine_commands;
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
            audio_engine_commands::get_audio_engine_runtime_status,
            audio_engine_commands::get_audio_device_formats,
            audio_engine_commands::start_audio_engine_test,
            audio_engine_commands::stop_audio_engine_test,
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                audio_engine::engine_shutdown();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
