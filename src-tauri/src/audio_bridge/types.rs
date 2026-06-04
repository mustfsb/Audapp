use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BridgeState {
    Stopped,
    Starting,
    Running,
    Stopping,
    Error,
}

impl Default for BridgeState {
    fn default() -> Self {
        BridgeState::Stopped
    }
}

/// Describes what the running bridge is actually doing.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum BridgeMode {
    /// No monitor output; loopback capture only.
    #[default]
    CaptureOnly,
    /// Loopback → physical output pass-through active (same sample rate).
    Passthrough,
    /// Loopback → physical output with linear-interpolation resampling active.
    ResampledPassthrough,
    /// Capture active but monitor disabled due to non-float or unsupported format.
    FormatMismatch,
    /// Worker encountered a fatal error.
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeCandidate {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeCandidates {
    pub audapp_render: Option<BridgeCandidate>,
    pub physical_outputs: Vec<BridgeCandidate>,
    pub audapp_capture: Option<BridgeCandidate>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgePocConfig {
    pub audapp_render_endpoint_id: Option<String>,
    pub audapp_capture_endpoint_id: Option<String>,
    pub monitor_output_endpoint_id: Option<String>,
    pub enable_render_loopback_capture: bool,
    pub enable_capture_endpoint_read: bool,
    pub enable_physical_monitor_output: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamStats {
    pub active: bool,
    pub initialize_ok: bool,
    pub start_ok: bool,
    pub packets_read: u64,
    pub frames_read: u64,
    pub bytes_read: u64,
    pub silence_count: u64,
    pub peak: f32,
    pub rms: f32,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputStats {
    pub active: bool,
    pub initialize_ok: bool,
    pub start_ok: bool,
    pub frames_written: u64,
    pub bytes_written: u64,
    pub underruns: u64,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgePocStatus {
    pub running: bool,
    pub state: BridgeState,
    pub mode: BridgeMode,
    pub audapp_render_id: Option<String>,
    pub audapp_render_name: Option<String>,
    pub audapp_capture_id: Option<String>,
    pub monitor_output_id: Option<String>,
    pub monitor_output_name: Option<String>,
    /// Human-readable format string for the loopback input, e.g. "44100Hz 2ch float32".
    pub input_format: Option<String>,
    /// Human-readable format string for the physical monitor output, e.g. "48000Hz 2ch float32".
    pub output_format: Option<String>,
    /// True when a linear-interpolation resampler is active in the pass-through path.
    pub resampler_active: bool,
    /// in_rate / out_rate ratio (e.g. 0.91875 for 44100→48000).
    pub resampler_ratio: f64,
    /// Frames currently sitting in the internal loopback→monitor pipeline buffer.
    pub pending_frames: u64,
    /// Frames dropped because the pipeline buffer exceeded the max threshold.
    pub dropped_frames: u64,
    /// DATA_DISCONTINUITY events counted separately from SILENT packets.
    pub capture_discontinuity_count: u64,
    /// WASAPI render buffer size (from GetBufferSize) in frames.
    pub render_buffer_frames: u32,
    /// WASAPI render current padding (from GetCurrentPadding) in frames.
    pub render_padding_frames: u64,
    /// Current pipeline buffer fill in milliseconds at output sample rate.
    pub buffer_fill_ms: f64,
    /// Target pipeline buffer fill in milliseconds.
    pub target_buffer_ms: f64,
    /// Frames of silence written to prime the render buffer before live data.
    pub primed_frames: u64,
    pub started_at: Option<String>,
    pub render_loopback: StreamStats,
    pub capture_read: StreamStats,
    pub monitor_output: OutputStats,
    pub last_error: Option<String>,
    pub updated_at: String,
    /// Whether DSP is currently enabled (from global DSP config).
    pub dsp_enabled: bool,
    /// Peak sample magnitude after DSP processing (0.0 – 1.0+).
    pub post_dsp_peak: f32,
    /// RMS level after DSP processing.
    pub post_dsp_rms: f32,
}

impl Default for BridgePocStatus {
    fn default() -> Self {
        Self {
            running: false,
            state: BridgeState::Stopped,
            mode: BridgeMode::CaptureOnly,
            audapp_render_id: None,
            audapp_render_name: None,
            audapp_capture_id: None,
            monitor_output_id: None,
            monitor_output_name: None,
            input_format: None,
            output_format: None,
            resampler_active: false,
            resampler_ratio: 1.0,
            pending_frames: 0,
            dropped_frames: 0,
            capture_discontinuity_count: 0,
            render_buffer_frames: 0,
            render_padding_frames: 0,
            buffer_fill_ms: 0.0,
            target_buffer_ms: 50.0,
            primed_frames: 0,
            started_at: None,
            render_loopback: StreamStats::default(),
            capture_read: StreamStats::default(),
            monitor_output: OutputStats::default(),
            last_error: None,
            updated_at: chrono::Utc::now().to_rfc3339(),
            dsp_enabled: false,
            post_dsp_peak: 0.0,
            post_dsp_rms: 0.0,
        }
    }
}
