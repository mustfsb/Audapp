use serde::Serialize;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingStatus {
    /// True when Audapp system routing is active (Windows default output = Audapp Input).
    pub routing_enabled: bool,
    /// Current Windows default render endpoint ID.
    pub current_default_render_id: Option<String>,
    /// Current Windows default render endpoint friendly name.
    pub current_default_render_name: Option<String>,
    /// Previous default render endpoint ID (restored on disable).
    pub previous_default_render_id: Option<String>,
    /// Previous default render endpoint friendly name.
    pub previous_default_render_name: Option<String>,
    /// Audapp Input virtual render endpoint ID.
    pub audapp_render_id: Option<String>,
    /// Audapp Input virtual render endpoint friendly name.
    pub audapp_render_name: Option<String>,
    /// Currently selected physical output endpoint ID.
    pub selected_output_id: Option<String>,
    /// Currently selected physical output endpoint friendly name.
    pub selected_output_name: Option<String>,
    /// Whether the audio bridge is currently running.
    pub bridge_running: bool,
    /// Whether a previous default endpoint is stored and can be restored.
    pub restore_available: bool,
    /// Last error message, if any.
    pub last_error: Option<String>,
}
