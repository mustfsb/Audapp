use serde::{Deserialize, Serialize};

use super::eq::{EQ_FREQUENCIES, NUM_EQ_BANDS};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqBandConfig {
    pub id: String,
    pub frequency_hz: f32,
    pub gain_db: f32,
    pub enabled: bool,
}

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
    pub limiter_enabled: bool,
    pub eq_enabled: bool,
    pub eq_preset: String,
    pub eq_bands: Vec<EqBandConfig>,
}

impl Default for DspRuntimeConfig {
    fn default() -> Self {
        let eq_bands = (0..NUM_EQ_BANDS)
            .map(|i| EqBandConfig {
                id: format!("band_{}hz", EQ_FREQUENCIES[i] as u32),
                frequency_hz: EQ_FREQUENCIES[i],
                gain_db: 0.0,
                enabled: true,
            })
            .collect();
        Self {
            enabled: false,
            output_gain_db: 0.0,
            input_gain_db: 0.0,
            high_pass_enabled: false,
            high_pass_hz: 80.0,
            low_pass_enabled: false,
            low_pass_hz: 18000.0,
            limiter_enabled: true,
            eq_enabled: false,
            eq_preset: "flat".to_string(),
            eq_bands,
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
