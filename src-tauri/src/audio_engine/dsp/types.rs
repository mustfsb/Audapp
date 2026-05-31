use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DspRuntimeConfig {
    pub enabled: bool,
    pub output_gain_db: f32,
    pub input_gain_db: f32,
    pub high_pass_enabled: bool,
    pub high_pass_hz: f32,
    pub low_pass_enabled: bool,
    pub low_pass_hz: f32,
}

impl Default for DspRuntimeConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            output_gain_db: 0.0,
            input_gain_db: 0.0,
            high_pass_enabled: false,
            high_pass_hz: 80.0,
            low_pass_enabled: false,
            low_pass_hz: 18000.0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DspRuntimeStatus {
    pub enabled: bool,
    pub active_in_engine: bool,
    pub supported: bool,
    pub unsupported_reason: Option<String>,
    pub sample_format: Option<String>,
    pub config_version: u32,
    pub last_updated_at: String,
}
