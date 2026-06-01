use tauri::Manager;

use crate::audio_engine::{
    dsp_get_config, dsp_get_status, dsp_reset_config, dsp_set_config, dsp_set_eq_preset,
    engine_start, engine_status, engine_stop, probe_device_formats, routing_start, routing_status,
    routing_stop, AudioEngineRuntimeStatus, AudioRoutingRuntimeStatus, DeviceFormatInfo,
    DspRuntimeConfig, DspRuntimeStatus, RoutingConfigInput, StartAudioEngineTestInput,
};
use crate::audio_engine::dsp::persistence as dsp_persistence;

#[tauri::command]
pub fn get_audio_engine_runtime_status() -> AudioEngineRuntimeStatus {
    engine_status()
}

#[tauri::command]
pub fn get_audio_device_formats() -> Vec<DeviceFormatInfo> {
    probe_device_formats()
}

#[tauri::command]
pub fn start_audio_engine_test(
    input: StartAudioEngineTestInput,
) -> Result<AudioEngineRuntimeStatus, String> {
    engine_start(input).map_err(|e| e.message())
}

#[tauri::command]
pub fn stop_audio_engine_test() -> AudioEngineRuntimeStatus {
    engine_stop()
}

#[tauri::command]
pub fn get_dsp_config() -> DspRuntimeConfig {
    dsp_get_config()
}

#[tauri::command]
pub fn set_dsp_config(app: tauri::AppHandle, config: DspRuntimeConfig) -> DspRuntimeStatus {
    let status = dsp_set_config(config.clone());
    if let Ok(data_dir) = app.path().app_local_data_dir() {
        let _ = dsp_persistence::save_dsp_config(&data_dir, &config);
    }
    status
}

#[tauri::command]
pub fn reset_dsp_config(app: tauri::AppHandle) -> DspRuntimeConfig {
    let config = dsp_reset_config();
    if let Ok(data_dir) = app.path().app_local_data_dir() {
        let _ = dsp_persistence::reset_persisted_dsp_config(&data_dir);
    }
    config
}

#[tauri::command]
pub fn get_dsp_status() -> DspRuntimeStatus {
    dsp_get_status()
}

#[tauri::command]
pub fn start_audio_routing(
    input: RoutingConfigInput,
) -> Result<AudioRoutingRuntimeStatus, String> {
    routing_start(input).map_err(|e| e.message())
}

#[tauri::command]
pub fn stop_audio_routing() -> AudioRoutingRuntimeStatus {
    routing_stop()
}

#[tauri::command]
pub fn get_audio_routing_status() -> AudioRoutingRuntimeStatus {
    routing_status()
}

#[tauri::command]
pub fn set_dsp_eq_preset(app: tauri::AppHandle, preset: String) -> DspRuntimeStatus {
    let status = dsp_set_eq_preset(&preset);
    if let Ok(data_dir) = app.path().app_local_data_dir() {
        let current = dsp_get_config();
        let _ = dsp_persistence::save_dsp_config(&data_dir, &current);
    }
    status
}
