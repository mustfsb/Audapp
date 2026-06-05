use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDiscoveryDevice {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub state: String,
    pub is_default: bool,
    /// True when this endpoint belongs to any Audapp driver.
    pub is_audapp_endpoint: bool,
    /// "input" | "channel_output" | "legacy_multi" | "unknown", or `None` when
    /// not an Audapp endpoint.
    pub audapp_endpoint_kind: Option<String>,
    /// Internal output channel id ("general" | "music" | "game" | "browser")
    /// for AudappChannels outputs; `None` otherwise.
    pub audapp_channel_id: Option<String>,
}

impl AudioDiscoveryDevice {
    /// Build a device, deriving the Audapp classification from its friendly name.
    pub fn new(id: String, name: String, kind: String, state: String, is_default: bool) -> Self {
        let class = super::audapp_endpoint::classify_audapp_endpoint(&name);
        Self {
            id,
            name,
            kind,
            state,
            is_default,
            is_audapp_endpoint: class.is_audapp_endpoint,
            audapp_endpoint_kind: class.kind.map(|kind| kind.as_str().to_string()),
            audapp_channel_id: class.channel_id.map(|channel| channel.to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDiscoverySession {
    pub id: String,
    pub session_id: Option<String>,
    pub session_instance_id: Option<String>,
    pub grouping_param: Option<String>,
    pub display_name: String,
    pub process_id: Option<u32>,
    pub process_name: Option<String>,
    pub executable_path: Option<String>,
    pub app_user_model_id: Option<String>,
    pub package_full_name: Option<String>,
    pub package_family_name: Option<String>,
    pub device_id: Option<String>,
    pub state: String,
    pub volume: Option<f32>,
    pub muted: Option<bool>,
    pub is_system_sounds: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSessionTarget {
    pub device_id: String,
    pub session_id: Option<String>,
    pub session_instance_id: Option<String>,
    pub process_id: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelAssignmentMatch {
    pub process_name: Option<String>,
    pub executable_path: Option<String>,
    pub process_id: Option<u32>,
    pub session_display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelAssignment {
    pub id: String,
    pub channel_id: String,
    #[serde(rename = "match")]
    pub match_rule: ChannelAssignmentMatch,
    pub label: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSessionControlResult {
    pub ok: bool,
    pub target: AudioSessionTarget,
    pub requested_volume: Option<f32>,
    pub requested_muted: Option<bool>,
    pub message: Option<String>,
    pub warning: Option<String>,
    pub snapshot: Option<AudioDiscoverySnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDiscoveryStatus {
    pub source: String,
    pub state: String,
    pub warnings: Vec<String>,
    pub refreshed_at: Option<String>,
    pub device_count: usize,
    pub session_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDiscoverySnapshot {
    pub devices: Vec<AudioDiscoveryDevice>,
    pub sessions: Vec<AudioDiscoverySession>,
    pub status: AudioDiscoveryStatus,
}

#[cfg(not(windows))]
impl AudioDiscoverySnapshot {
    pub fn unavailable(message: impl Into<String>) -> Self {
        let message = message.into();
        Self {
            devices: Vec::new(),
            sessions: Vec::new(),
            status: AudioDiscoveryStatus {
                source: "unavailable".to_string(),
                state: "error".to_string(),
                warnings: vec![message],
                refreshed_at: None,
                device_count: 0,
                session_count: 0,
            },
        }
    }
}
