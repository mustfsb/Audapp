mod audio;
mod audio_bridge;
mod audio_engine;
mod audio_engine_commands;
mod audio_policy;
mod bridge_commands;
mod commands;
mod routing_commands;
mod voice_lab;
mod voice_lab_commands;

pub use audio::{
    capture_discovery_snapshot, enumerate_endpoint_diagnostics, probe_endpoint,
    AudioEndpointDiagnostic, EndpointProbeResult,
};

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
            commands::get_session_route_intents,
            commands::get_session_route_capability,
            commands::set_session_route_intent,
            commands::clear_session_route_intent,
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
            commands::get_audio_endpoint_diagnostics,
            commands::probe_audio_endpoint,
            bridge_commands::start_audio_bridge_poc,
            bridge_commands::stop_audio_bridge_poc,
            bridge_commands::get_audio_bridge_status,
            bridge_commands::list_bridge_candidates,
            routing_commands::routing_get_status_cmd,
            routing_commands::routing_enable_system,
            routing_commands::routing_disable_system,
            voice_lab_commands::voice_list_input_devices,
            voice_lab_commands::voice_list_monitor_outputs,
            voice_lab_commands::voice_start_lab,
            voice_lab_commands::voice_stop_lab,
            voice_lab_commands::voice_get_status,
            voice_lab_commands::voice_update_settings,
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                audio_engine::engine_shutdown();
                audio_engine::routing_shutdown();
                audio_bridge::bridge_shutdown();
                voice_lab::voice_shutdown();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
