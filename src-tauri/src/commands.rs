use crate::audio::{
    self, clear_route_intent_for_target, load_assignments, load_mixer_channel_settings,
    load_session_route_intents, remove_assignment,
    reset_mixer_channel_settings as reset_persisted_mixer_settings, set_route_intent_for_target,
    set_session_mute_with_snapshot, set_session_volume_with_snapshot, upsert_assignment,
    upsert_mixer_channel_setting, AudioDiscoverySnapshot, AudioEndpointDiagnostic,
    AudioSessionControlResult, AudioSessionTarget, ChannelAssignment, ChannelAssignmentMatch,
    EndpointProbeResult, MixerChannelSetting, SessionRouteCapability, SessionRouteIntent,
    SessionRouteIntentEntry,
};
use crate::audio_bridge::{
    init_runtime_channel_config, reset_runtime_channel_config, update_runtime_channel_config,
};
use serde::Deserialize;
use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    state: String,
    latency_mode: String,
    cpu_load: u8,
    audio_load: u8,
    warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAudioSessionVolumeInput {
    pub target: AudioSessionTarget,
    pub volume_percent: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAudioSessionMuteInput {
    pub target: AudioSessionTarget,
    pub muted: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetChannelAssignmentInput {
    pub channel_id: String,
    #[serde(rename = "match")]
    pub match_rule: ChannelAssignmentMatch,
    pub label: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveChannelAssignmentInput {
    pub assignment_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetMixerChannelSettingInput {
    pub channel_id: String,
    pub volume_percent: f32,
    pub muted: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSessionRouteIntentInput {
    pub target: AudioSessionTarget,
    pub intent: SessionRouteIntent,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearSessionRouteIntentInput {
    pub target: AudioSessionTarget,
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn get_audio_engine_status() -> EngineStatus {
    EngineStatus {
        state: "Mock Ready".to_string(),
        latency_mode: "Balanced".to_string(),
        cpu_load: 22,
        audio_load: 36,
        warnings: vec![
            "Audio routing and DSP are not implemented yet.".to_string(),
            "Session volume/mute control is available from the Apps page.".to_string(),
        ],
    }
}

#[tauri::command]
pub fn get_audio_discovery_snapshot() -> AudioDiscoverySnapshot {
    audio::capture_discovery_snapshot()
}

#[tauri::command]
pub fn set_audio_session_volume(input: SetAudioSessionVolumeInput) -> AudioSessionControlResult {
    set_session_volume_with_snapshot(input.target, input.volume_percent)
}

#[tauri::command]
pub fn set_audio_session_mute(input: SetAudioSessionMuteInput) -> AudioSessionControlResult {
    set_session_mute_with_snapshot(input.target, input.muted)
}

#[tauri::command]
pub fn get_session_route_intents(
    app: tauri::AppHandle,
) -> Result<Vec<SessionRouteIntentEntry>, String> {
    let base_dir = app_data_dir(&app)?;
    load_session_route_intents(&base_dir).map_err(|error| error.message())
}

#[tauri::command]
pub fn set_session_route_intent(
    app: tauri::AppHandle,
    input: SetSessionRouteIntentInput,
) -> Result<SessionRouteIntentEntry, String> {
    let base_dir = app_data_dir(&app)?;
    set_route_intent_for_target(&base_dir, &input.target, input.intent)
        .map_err(|error| error.message())
}

#[tauri::command]
pub fn clear_session_route_intent(
    app: tauri::AppHandle,
    input: ClearSessionRouteIntentInput,
) -> Result<(), String> {
    let base_dir = app_data_dir(&app)?;
    clear_route_intent_for_target(&base_dir, &input.target).map_err(|error| error.message())
}

#[tauri::command]
pub fn get_session_route_capability() -> SessionRouteCapability {
    audio::get_session_route_capability()
}

#[tauri::command]
pub fn get_channel_assignments(app: tauri::AppHandle) -> Result<Vec<ChannelAssignment>, String> {
    let base_dir = app_data_dir(&app)?;
    load_assignments(&base_dir).map_err(|error| error.message())
}

#[tauri::command]
pub fn set_channel_assignment(
    app: tauri::AppHandle,
    input: SetChannelAssignmentInput,
) -> Result<ChannelAssignment, String> {
    let base_dir = app_data_dir(&app)?;
    upsert_assignment(&base_dir, input.channel_id, input.match_rule, input.label)
        .map_err(|error| error.message())
}

#[tauri::command]
pub fn remove_channel_assignment(
    app: tauri::AppHandle,
    input: RemoveChannelAssignmentInput,
) -> Result<(), String> {
    let base_dir = app_data_dir(&app)?;
    remove_assignment(&base_dir, &input.assignment_id).map_err(|error| error.message())
}

#[tauri::command]
pub fn get_mixer_channel_settings(
    app: tauri::AppHandle,
) -> Result<Vec<MixerChannelSetting>, String> {
    let base_dir = app_data_dir(&app)?;
    let settings = load_mixer_channel_settings(&base_dir);
    init_runtime_channel_config(&settings);
    Ok(settings)
}

#[tauri::command]
pub fn set_mixer_channel_setting(
    app: tauri::AppHandle,
    input: SetMixerChannelSettingInput,
) -> Result<MixerChannelSetting, String> {
    let base_dir = app_data_dir(&app)?;
    let volume_percent = input.volume_percent.clamp(0.0, 100.0).round() as u8;
    let saved = upsert_mixer_channel_setting(&base_dir, input.channel_id, volume_percent, input.muted)
        .map_err(|error| error.message())?;
    update_runtime_channel_config(&saved.channel_id, saved.volume_percent, saved.muted)?;
    Ok(saved)
}

#[tauri::command]
pub fn reset_mixer_channel_settings(app: tauri::AppHandle) -> Result<(), String> {
    let base_dir = app_data_dir(&app)?;
    reset_persisted_mixer_settings(&base_dir).map_err(|error| error.message())?;
    reset_runtime_channel_config();
    Ok(())
}

#[tauri::command]
pub fn get_audio_endpoint_diagnostics() -> Result<Vec<AudioEndpointDiagnostic>, String> {
    audio::enumerate_endpoint_diagnostics()
}

#[tauri::command]
pub fn probe_audio_endpoint(endpoint_id: String) -> EndpointProbeResult {
    audio::probe_endpoint(endpoint_id)
}
