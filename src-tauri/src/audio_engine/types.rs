use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineState {
    Stopped,
    Starting,
    Running,
    Stopping,
    Error,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineMode {
    None,
    RenderSilence,
    RenderTestTone,
    CaptureMeter,
    CaptureToNull,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioEngineRuntimeStatus {
    pub state: EngineState,
    pub mode: EngineMode,
    pub input_device_id: Option<String>,
    pub output_device_id: Option<String>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub bits_per_sample: Option<u16>,
    pub buffer_frames: Option<u32>,
    pub estimated_latency_ms: Option<f64>,
    pub peak_level: Option<f32>,
    pub rms_level: Option<f32>,
    pub glitch_count: u32,
    pub warning: Option<String>,
    pub last_error: Option<String>,
    pub updated_at: String,
}

impl Default for AudioEngineRuntimeStatus {
    fn default() -> Self {
        Self {
            state: EngineState::Stopped,
            mode: EngineMode::None,
            input_device_id: None,
            output_device_id: None,
            sample_rate: None,
            channels: None,
            bits_per_sample: None,
            buffer_frames: None,
            estimated_latency_ms: None,
            peak_level: None,
            rms_level: None,
            glitch_count: 0,
            warning: None,
            last_error: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAudioEngineTestInput {
    pub mode: EngineMode,
    pub input_device_id: Option<String>,
    pub output_device_id: Option<String>,
    pub tone_frequency_hz: Option<f32>,
    pub tone_gain: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFormatInfo {
    pub device_id: String,
    pub device_name: String,
    pub kind: String,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub bits_per_sample: Option<u16>,
    pub is_float: bool,
}
