use crate::audio_engine::{
    dsp_get_config, dsp_get_status, dsp_reset_config, dsp_set_config,
    engine_start, engine_status, engine_stop, probe_device_formats,
    AudioEngineRuntimeStatus, DeviceFormatInfo, DspRuntimeConfig, DspRuntimeStatus,
    StartAudioEngineTestInput,
};

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
pub fn set_dsp_config(config: DspRuntimeConfig) -> DspRuntimeStatus {
    dsp_set_config(config)
}

#[tauri::command]
pub fn reset_dsp_config() -> DspRuntimeConfig {
    dsp_reset_config()
}

#[tauri::command]
pub fn get_dsp_status() -> DspRuntimeStatus {
    dsp_get_status()
}
