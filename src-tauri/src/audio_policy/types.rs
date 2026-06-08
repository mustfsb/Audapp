use serde::{Deserialize, Serialize};

use crate::audio_bridge::BridgeState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedOutputDevicePreference {
    pub endpoint_id: String,
    pub name: String,
    pub last_seen_at: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputPreferencesStatus {
    pub primary_output: Option<SavedOutputDevicePreference>,
    pub fallback_output: Option<SavedOutputDevicePreference>,
    pub resolved_output_id: Option<String>,
    pub resolved_output_name: Option<String>,
    pub resolution_reason: Option<String>,
    pub resolution_message: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingStatus {
    /// True when Audapp system routing is active (Windows default output = Audapp General).
    pub routing_enabled: bool,
    /// Current Windows default render endpoint ID.
    pub current_default_render_id: Option<String>,
    /// Current Windows default render endpoint friendly name.
    pub current_default_render_name: Option<String>,
    /// Previous default render endpoint ID (restored on disable).
    pub previous_default_render_id: Option<String>,
    /// Previous default render endpoint friendly name.
    pub previous_default_render_name: Option<String>,
    /// Audapp General render endpoint ID used as the Windows default during active routing.
    pub audapp_default_render_id: Option<String>,
    /// Audapp General render endpoint friendly name.
    pub audapp_default_render_name: Option<String>,
    /// Currently selected physical output endpoint ID.
    pub selected_output_id: Option<String>,
    /// Currently selected physical output endpoint friendly name.
    pub selected_output_name: Option<String>,
    /// Whether the multi-channel bridge is currently running.
    pub bridge_running: bool,
    /// Bridge lifecycle state for the multi-channel worker.
    pub bridge_state: BridgeState,
    /// Whether the current or most recent activation was auto-started.
    pub auto_started: bool,
    /// Whether a previous default endpoint is stored and can be restored.
    pub restore_available: bool,
    /// Last error message, if any.
    pub last_error: Option<String>,
}
