use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

use super::types::AudioSessionTarget;

const SESSION_ROUTE_INTENTS_FILE: &str = "session-route-intents.json";
const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionRouteIntent {
    System,
    Audapp,
    Bypass,
    MonitorOnly,
}

impl Default for SessionRouteIntent {
    fn default() -> Self {
        Self::System
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionRouteIntentEntry {
    pub session_key: String,
    pub intent: SessionRouteIntent,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSessionRouteIntentFile {
    schema_version: u32,
    saved_at: String,
    entries: Vec<SessionRouteIntentEntry>,
}

#[derive(Debug, Clone)]
pub enum SessionRouteIntentError {
    Io(String),
    Parse(String),
    InvalidInput(String),
}

impl SessionRouteIntentError {
    pub fn message(&self) -> String {
        match self {
            Self::Io(message) | Self::Parse(message) | Self::InvalidInput(message) => {
                message.clone()
            }
        }
    }
}

pub fn session_route_intents_file_path(base_dir: &Path) -> PathBuf {
    base_dir.join(SESSION_ROUTE_INTENTS_FILE)
}

pub fn load_session_route_intents(
    base_dir: &Path,
) -> Result<Vec<SessionRouteIntentEntry>, SessionRouteIntentError> {
    let path = session_route_intents_file_path(base_dir);
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(SessionRouteIntentError::Io(format!(
                "Failed to read session route intents: {error}"
            )))
        }
    };

    if bytes.is_empty() {
        return Ok(Vec::new());
    }

    let file: PersistedSessionRouteIntentFile =
        serde_json::from_slice(&bytes).map_err(|error| {
            SessionRouteIntentError::Parse(format!(
                "Session route intents file is invalid: {error}"
            ))
        })?;

    if file.schema_version != CURRENT_SCHEMA_VERSION {
        return Ok(Vec::new());
    }

    Ok(file.entries)
}

pub fn get_route_intent_for_target(
    base_dir: &Path,
    target: &AudioSessionTarget,
) -> Result<SessionRouteIntent, SessionRouteIntentError> {
    let session_key = route_intent_key_from_target(target)?;
    let entries = load_session_route_intents(base_dir)?;
    Ok(entries
        .into_iter()
        .find(|entry| entry.session_key == session_key)
        .map(|entry| entry.intent)
        .unwrap_or_default())
}

pub fn set_route_intent_for_target(
    base_dir: &Path,
    target: &AudioSessionTarget,
    intent: SessionRouteIntent,
) -> Result<SessionRouteIntentEntry, SessionRouteIntentError> {
    let session_key = route_intent_key_from_target(target)?;
    let mut entries = load_session_route_intents(base_dir)?;
    let updated = SessionRouteIntentEntry {
        session_key: session_key.clone(),
        intent,
        updated_at: Utc::now().to_rfc3339(),
    };

    if intent == SessionRouteIntent::System {
        entries.retain(|entry| entry.session_key != session_key);
        save_session_route_intents(base_dir, &entries)?;
        return Ok(updated);
    }

    if let Some(existing) = entries
        .iter_mut()
        .find(|entry| entry.session_key == session_key)
    {
        *existing = updated.clone();
    } else {
        entries.push(updated.clone());
    }

    save_session_route_intents(base_dir, &entries)?;
    Ok(updated)
}

pub fn clear_route_intent_for_target(
    base_dir: &Path,
    target: &AudioSessionTarget,
) -> Result<(), SessionRouteIntentError> {
    let session_key = route_intent_key_from_target(target)?;
    let mut entries = load_session_route_intents(base_dir)?;
    entries.retain(|entry| entry.session_key != session_key);
    save_session_route_intents(base_dir, &entries)
}

pub fn route_intent_key_from_target(
    target: &AudioSessionTarget,
) -> Result<String, SessionRouteIntentError> {
    let device_id = target.device_id.trim();
    if device_id.is_empty() {
        return Err(SessionRouteIntentError::InvalidInput(
            "Session route intent requires a deviceId.".to_string(),
        ));
    }

    let session_id = target.session_id.as_deref().unwrap_or("").trim();
    let session_instance_id = target.session_instance_id.as_deref().unwrap_or("").trim();
    let process_id = target.process_id;

    if session_id.is_empty() && session_instance_id.is_empty() && process_id.is_none() {
        return Err(SessionRouteIntentError::InvalidInput(
            "Session route intent requires a sessionId, sessionInstanceId, or processId."
                .to_string(),
        ));
    }

    Ok(format!(
        "{device_id}::{session_id}::{session_instance_id}::{}",
        process_id
            .map(|value| value.to_string())
            .unwrap_or_else(|| "-".to_string()),
        session_id = if session_id.is_empty() {
            "-"
        } else {
            session_id
        },
        session_instance_id = if session_instance_id.is_empty() {
            "-"
        } else {
            session_instance_id
        },
    ))
}

fn save_session_route_intents(
    base_dir: &Path,
    entries: &[SessionRouteIntentEntry],
) -> Result<(), SessionRouteIntentError> {
    fs::create_dir_all(base_dir).map_err(|error| {
        SessionRouteIntentError::Io(format!("Failed to create app data directory: {error}"))
    })?;

    let file = PersistedSessionRouteIntentFile {
        schema_version: CURRENT_SCHEMA_VERSION,
        saved_at: Utc::now().to_rfc3339(),
        entries: entries.to_vec(),
    };

    let json = serde_json::to_string_pretty(&file).map_err(|error| {
        SessionRouteIntentError::Io(format!(
            "Failed to serialize session route intents: {error}"
        ))
    })?;

    atomic_write(&session_route_intents_file_path(base_dir), &json)
}

fn atomic_write(path: &Path, contents: &str) -> Result<(), SessionRouteIntentError> {
    let parent = path.parent().ok_or_else(|| {
        SessionRouteIntentError::Io(
            "Session route intents path has no parent directory.".to_string(),
        )
    })?;

    let temp_path = parent.join(format!(
        "{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(SESSION_ROUTE_INTENTS_FILE)
    ));

    fs::write(&temp_path, contents).map_err(|error| {
        SessionRouteIntentError::Io(format!(
            "Failed to write session route intents temp file: {error}"
        ))
    })?;

    if path.exists() {
        fs::remove_file(path).map_err(|error| {
            SessionRouteIntentError::Io(format!(
                "Failed to replace session route intents file: {error}"
            ))
        })?;
    }

    fs::rename(&temp_path, path).map_err(|error| {
        SessionRouteIntentError::Io(format!(
            "Failed to finalize session route intents file: {error}"
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("audapp-session-intents-{nanos}"))
    }

    fn target(
        device_id: &str,
        session_id: Option<&str>,
        session_instance_id: Option<&str>,
        process_id: Option<u32>,
    ) -> AudioSessionTarget {
        AudioSessionTarget {
            device_id: device_id.to_string(),
            session_id: session_id.map(str::to_string),
            session_instance_id: session_instance_id.map(str::to_string),
            process_id,
        }
    }

    #[test]
    fn route_intent_defaults_to_system_when_store_is_empty() {
        let dir = temp_dir();
        let value = get_route_intent_for_target(
            &dir,
            &target("device-1", Some("session-a"), Some("instance-a"), Some(42)),
        )
        .expect("intent");

        assert_eq!(value, SessionRouteIntent::System);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn set_then_load_round_trip_preserves_monitor_only() {
        let dir = temp_dir();
        let saved = set_route_intent_for_target(
            &dir,
            &target("device-1", Some("session-a"), Some("instance-a"), Some(42)),
            SessionRouteIntent::MonitorOnly,
        )
        .expect("saved");

        assert_eq!(saved.intent, SessionRouteIntent::MonitorOnly);

        let loaded = load_session_route_intents(&dir).expect("load");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].intent, SessionRouteIntent::MonitorOnly);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn clear_route_intent_removes_saved_entry() {
        let dir = temp_dir();
        let target = target("device-1", Some("session-a"), Some("instance-a"), Some(42));

        set_route_intent_for_target(&dir, &target, SessionRouteIntent::Audapp).expect("saved");
        clear_route_intent_for_target(&dir, &target).expect("cleared");

        let loaded = load_session_route_intents(&dir).expect("load");
        assert!(loaded.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn route_intent_key_requires_at_least_one_session_identifier() {
        let error = route_intent_key_from_target(&target("device-1", None, None, None))
            .expect_err("invalid input should fail");

        assert_eq!(
            error.message(),
            "Session route intent requires a sessionId, sessionInstanceId, or processId."
        );
    }
}
