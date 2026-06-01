mod audio;
mod audio_engine;
mod audio_engine_commands;
mod commands;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Ok(data_dir) = app.path().app_local_data_dir() {
                audio_engine::dsp_load_and_apply_persisted(&data_dir);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::get_audio_engine_status,
            commands::get_audio_discovery_snapshot,
            commands::set_audio_session_volume,
            commands::set_audio_session_mute,
            commands::get_channel_assignments,
            commands::set_channel_assignment,
            commands::remove_channel_assignment,
            commands::get_mixer_channel_settings,
            commands::set_mixer_channel_setting,
            commands::reset_mixer_channel_settings,
            audio_engine_commands::get_audio_engine_runtime_status,
            audio_engine_commands::get_audio_device_formats,
            audio_engine_commands::start_audio_engine_test,
            audio_engine_commands::stop_audio_engine_test,
            audio_engine_commands::get_dsp_config,
            audio_engine_commands::set_dsp_config,
            audio_engine_commands::reset_dsp_config,
            audio_engine_commands::get_dsp_status,
            audio_engine_commands::set_dsp_eq_preset,
            audio_engine_commands::start_audio_routing,
            audio_engine_commands::stop_audio_routing,
            audio_engine_commands::get_audio_routing_status,
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                audio_engine::engine_shutdown();
                audio_engine::routing_shutdown();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
