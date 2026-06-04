use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceLabSettings {
    pub input_device_id: Option<String>,
    pub monitor_device_id: Option<String>,
    pub input_gain_db: f32,
    pub high_pass_enabled: bool,
    pub high_pass_hz: f32,
    pub gate_enabled: bool,
    pub gate_threshold_db: f32,
    pub gate_release_ms: f32,
    pub limiter_enabled: bool,
    pub monitor_enabled: bool,
}

impl Default for VoiceLabSettings {
    fn default() -> Self {
        Self {
            input_device_id: None,
            monitor_device_id: None,
            input_gain_db: 0.0,
            high_pass_enabled: true,
            high_pass_hz: 80.0,
            gate_enabled: false,
            gate_threshold_db: -40.0,
            gate_release_ms: 100.0,
            limiter_enabled: true,
            monitor_enabled: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum VoiceLabState {
    Stopped,
    Starting,
    Running,
    Stopping,
    Error,
}

impl Default for VoiceLabState {
    fn default() -> Self {
        VoiceLabState::Stopped
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceLabStatus {
    pub running: bool,
    pub state: VoiceLabState,
    pub raw_peak: f32,
    pub raw_rms: f32,
    pub processed_peak: f32,
    pub processed_rms: f32,
    pub gate_open: bool,
    pub input_format: Option<String>,
    pub monitor_output_format: Option<String>,
    pub last_error: Option<String>,
    pub updated_at: String,
}

impl Default for VoiceLabStatus {
    fn default() -> Self {
        Self {
            running: false,
            state: VoiceLabState::Stopped,
            raw_peak: 0.0,
            raw_rms: 0.0,
            processed_peak: 0.0,
            processed_rms: 0.0,
            gate_open: false,
            input_format: None,
            monitor_output_format: None,
            last_error: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}
