use crate::audio_engine::{
    engine_start, engine_status, engine_stop, probe_device_formats,
    AudioEngineRuntimeStatus, DeviceFormatInfo, StartAudioEngineTestInput,
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
