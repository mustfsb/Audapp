use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDiscoveryDevice {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub state: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDiscoverySession {
    pub id: String,
    pub session_id: Option<String>,
    pub session_instance_id: Option<String>,
    pub display_name: String,
    pub process_id: Option<u32>,
    pub process_name: Option<String>,
    pub executable_path: Option<String>,
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
