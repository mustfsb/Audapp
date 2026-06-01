use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoutingState {
    Stopped,
    Starting,
    Running,
    Stopping,
    Error,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingConfigInput {
    pub capture_device_id: String,
    pub render_device_id: String,
    pub requested_buffer_ms: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioRoutingRuntimeStatus {
    pub state: RoutingState,
    pub capture_device_id: Option<String>,
    pub render_device_id: Option<String>,
    pub sample_rate: Option<u32>,
    pub input_channels: Option<u16>,
    pub output_channels: Option<u16>,
    pub buffer_frames: Option<u32>,
    pub estimated_latency_ms: Option<f32>,
    pub ring_fill_percent: Option<f32>,
    pub underrun_count: u64,
    pub overrun_count: u64,
    pub glitch_count: u64,
    pub peak_level: Option<f32>,
    pub rms_level: Option<f32>,
    pub warning: Option<String>,
    pub last_error: Option<String>,
    pub updated_at: String,
}

impl Default for AudioRoutingRuntimeStatus {
    fn default() -> Self {
        Self {
            state: RoutingState::Stopped,
            capture_device_id: None,
            render_device_id: None,
            sample_rate: None,
            input_channels: None,
            output_channels: None,
            buffer_frames: None,
            estimated_latency_ms: None,
            ring_fill_percent: None,
            underrun_count: 0,
            overrun_count: 0,
            glitch_count: 0,
            peak_level: None,
            rms_level: None,
            warning: None,
            last_error: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

#[derive(Debug, Clone)]
pub enum RoutingError {
    AlreadyRunning,
    EngineActive,
    InvalidInput(String),
    Platform(String),
}

impl RoutingError {
    pub fn message(&self) -> String {
        match self {
            Self::AlreadyRunning => {
                "Audio routing is already running. Stop it first.".to_string()
            }
            Self::EngineActive => {
                "Audio Engine Lab is running. Stop the engine test first.".to_string()
            }
            Self::InvalidInput(msg) => msg.clone(),
            Self::Platform(msg) => msg.clone(),
        }
    }
}
