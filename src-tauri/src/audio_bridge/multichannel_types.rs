use serde::{Deserialize, Serialize};

use crate::audio_bridge::types::{BridgeCandidate, BridgeState, OutputStats, StreamStats};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelBridgeCandidate {
    pub channel_id: String,
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultichannelBridgeCandidates {
    pub channel_outputs: Vec<ChannelBridgeCandidate>,
    pub physical_outputs: Vec<BridgeCandidate>,
    pub legacy_input: Option<BridgeCandidate>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultichannelSourceStatus {
    pub channel_id: String,
    pub endpoint_id: Option<String>,
    pub endpoint_name: Option<String>,
    pub input_format: Option<String>,
    pub active: bool,
    pub available: bool,
    pub pending_frames: u64,
    pub dropped_frames: u64,
    pub discontinuity_count: u64,
    pub resampler_active: bool,
    pub resampler_ratio: f64,
    pub gain_percent: u8,
    pub muted: bool,
    pub stream: StreamStats,
}

impl MultichannelSourceStatus {
    pub fn idle(channel_id: &str) -> Self {
        Self {
            channel_id: channel_id.to_string(),
            endpoint_id: None,
            endpoint_name: None,
            input_format: None,
            active: false,
            available: false,
            pending_frames: 0,
            dropped_frames: 0,
            discontinuity_count: 0,
            resampler_active: false,
            resampler_ratio: 1.0,
            gain_percent: 100,
            muted: false,
            stream: StreamStats::default(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultichannelOutputStatus {
    /// The physical (non-Audapp) render endpoint the bridge mix is sent to.
    pub output_id: Option<String>,
    pub output_name: Option<String>,
    pub output_format: Option<String>,
    /// The current Windows default render endpoint (which may legitimately be an
    /// Audapp endpoint during routing). Exposed so the UI can show physical-output
    /// vs Windows-default honestly.
    pub default_render_id: Option<String>,
    pub default_render_name: Option<String>,
    /// True only if the resolved physical output is (wrongly) an Audapp endpoint.
    /// This must always be false in a healthy bridge; true indicates a bug.
    pub is_physical_output_audapp: bool,
    pub render_buffer_frames: u32,
    pub render_padding_frames: u64,
    pub buffer_fill_ms: f64,
    pub target_buffer_ms: f64,
    pub primed_frames: u64,
    pub output: OutputStats,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultichannelBridgeStatus {
    pub running: bool,
    pub state: BridgeState,
    pub auto_started: bool,
    pub sources: Vec<MultichannelSourceStatus>,
    pub monitor_output: MultichannelOutputStatus,
    pub started_at: Option<String>,
    pub last_error: Option<String>,
    pub updated_at: String,
    pub dsp_enabled: bool,
    pub post_dsp_peak: f32,
    pub post_dsp_rms: f32,
}

impl Default for MultichannelBridgeStatus {
    fn default() -> Self {
        Self {
            running: false,
            state: BridgeState::Stopped,
            auto_started: false,
            sources: vec![
                MultichannelSourceStatus::idle("general"),
                MultichannelSourceStatus::idle("music"),
                MultichannelSourceStatus::idle("game"),
                MultichannelSourceStatus::idle("browser"),
            ],
            monitor_output: MultichannelOutputStatus::default(),
            started_at: None,
            last_error: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
            dsp_enabled: false,
            post_dsp_peak: 0.0,
            post_dsp_rms: 0.0,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultichannelBridgeConfig {
    pub general_endpoint_id: String,
    pub music_endpoint_id: String,
    pub game_endpoint_id: String,
    pub browser_endpoint_id: String,
    pub output_endpoint_id: String,
    pub auto_started: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_status_contains_exactly_four_expected_channels() {
        let status = MultichannelBridgeStatus::default();
        let channel_ids: Vec<&str> = status
            .sources
            .iter()
            .map(|source| source.channel_id.as_str())
            .collect();

        assert_eq!(channel_ids, vec!["general", "music", "game", "browser"]);
    }
}
