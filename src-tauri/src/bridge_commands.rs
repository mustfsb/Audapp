use tauri::Manager;

use crate::audio_bridge::{
    bridge_list_candidates, bridge_start, bridge_status, bridge_stop,
    channel_dsp::{
        get_all_channel_dsps, get_channel_dsp, save_channel_dsp_configs, set_channel_dsp,
        ChannelDspConfig,
    },
    multichannel_bridge_list_candidates, multichannel_bridge_start, multichannel_bridge_status,
    multichannel_bridge_stop, resolve_multichannel_start, BridgeCandidates, BridgePocConfig,
    BridgePocStatus, MultichannelBridgeCandidates, MultichannelBridgeStatus,
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

#[tauri::command]
pub fn get_multichannel_bridge_status() -> MultichannelBridgeStatus {
    multichannel_bridge_status()
}

#[tauri::command]
pub fn list_multichannel_bridge_candidates() -> Result<MultichannelBridgeCandidates, String> {
    multichannel_bridge_list_candidates()
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartMultichannelBridgeInput {
    pub output_endpoint_id: Option<String>,
    pub auto_started: Option<bool>,
}

#[tauri::command]
pub fn start_multichannel_bridge(
    input: Option<StartMultichannelBridgeInput>,
) -> Result<MultichannelBridgeStatus, String> {
    let input = input.unwrap_or(StartMultichannelBridgeInput {
        output_endpoint_id: None,
        auto_started: Some(false),
    });
    let resolved = resolve_multichannel_start(
        input.output_endpoint_id.as_deref(),
        input.auto_started.unwrap_or(false),
    )?;
    multichannel_bridge_start(resolved.config)
}

#[tauri::command]
pub fn stop_multichannel_bridge() -> MultichannelBridgeStatus {
    multichannel_bridge_stop()
}

#[tauri::command]
pub fn get_channel_dsp_config(channel_id: String) -> Result<ChannelDspConfig, String> {
    get_channel_dsp(&channel_id).ok_or_else(|| format!("Unknown channel: {channel_id}"))
}

#[tauri::command]
pub fn set_channel_dsp_config(
    app: tauri::AppHandle,
    config: ChannelDspConfig,
) -> Result<ChannelDspConfig, String> {
    let saved = set_channel_dsp(config)?;
    if let Ok(data_dir) = app.path().app_local_data_dir() {
        let _ = save_channel_dsp_configs(&data_dir);
    }
    Ok(saved)
}

#[tauri::command]
pub fn set_channel_eq_preset(
    app: tauri::AppHandle,
    channel_id: String,
    preset: String,
) -> Result<ChannelDspConfig, String> {
    let config = crate::audio_bridge::channel_dsp::set_channel_eq_preset(&channel_id, &preset)?;
    if let Ok(data_dir) = app.path().app_local_data_dir() {
        let _ = save_channel_dsp_configs(&data_dir);
    }
    Ok(config)
}

#[tauri::command]
pub fn get_all_channel_dsp_configs() -> Vec<ChannelDspConfig> {
    get_all_channel_dsps()
}
