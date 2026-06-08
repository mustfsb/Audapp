use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::types::SavedOutputDevicePreference;

const CONFIG_FILE_NAME: &str = "output-device-preferences.json";
const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Default)]
pub struct PersistedOutputPreferences {
    pub primary_output: Option<SavedOutputDevicePreference>,
    pub fallback_output: Option<SavedOutputDevicePreference>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedOutputPreferencesFile {
    schema_version: u32,
    saved_at: String,
    primary_output: Option<SavedOutputDevicePreference>,
    fallback_output: Option<SavedOutputDevicePreference>,
}

fn config_file_path(data_dir: &Path) -> PathBuf {
    data_dir.join(CONFIG_FILE_NAME)
}

pub fn load_output_preferences(data_dir: &Path) -> PersistedOutputPreferences {
    let path = config_file_path(data_dir);
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(_) => return PersistedOutputPreferences::default(),
    };
    let file: PersistedOutputPreferencesFile = match serde_json::from_slice(&bytes) {
        Ok(file) => file,
        Err(_) => return PersistedOutputPreferences::default(),
    };
    if file.schema_version != CURRENT_SCHEMA_VERSION {
        return PersistedOutputPreferences::default();
    }

    PersistedOutputPreferences {
        primary_output: file.primary_output,
        fallback_output: file.fallback_output,
    }
}

pub fn save_output_preferences(
    data_dir: &Path,
    preferences: &PersistedOutputPreferences,
) -> Result<(), String> {
    let path = config_file_path(data_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("failed to create data dir: {e}"))?;
    }

    let file = PersistedOutputPreferencesFile {
        schema_version: CURRENT_SCHEMA_VERSION,
        saved_at: chrono::Utc::now().to_rfc3339(),
        primary_output: preferences.primary_output.clone(),
        fallback_output: preferences.fallback_output.clone(),
    };
    let json = serde_json::to_string_pretty(&file)
        .map_err(|e| format!("failed to serialize output preferences: {e}"))?;
    let tmp_path = path.with_extension("tmp");
    std::fs::write(&tmp_path, json.as_bytes())
        .map_err(|e| format!("failed to write tmp output preferences: {e}"))?;
    std::fs::rename(&tmp_path, &path)
        .map_err(|e| format!("failed to rename tmp output preferences: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        use uuid::Uuid;
        let dir = std::env::temp_dir().join(format!("audapp_output_prefs_{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn missing_file_returns_empty_preferences() {
        let dir = temp_dir();
        let loaded = load_output_preferences(&dir);
        assert!(loaded.primary_output.is_none());
        assert!(loaded.fallback_output.is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn roundtrip_persists_primary_and_fallback_preferences() {
        let dir = temp_dir();
        let preferences = PersistedOutputPreferences {
            primary_output: Some(SavedOutputDevicePreference {
                endpoint_id: "speaker-id".into(),
                name: "Speakers (USB Audio Device)".into(),
                last_seen_at: "2026-06-08T00:00:00Z".into(),
            }),
            fallback_output: Some(SavedOutputDevicePreference {
                endpoint_id: "hdmi-id".into(),
                name: "Monitor (HDMI Audio)".into(),
                last_seen_at: "2026-06-08T00:00:01Z".into(),
            }),
        };

        save_output_preferences(&dir, &preferences).unwrap();
        let loaded = load_output_preferences(&dir);

        assert_eq!(
            loaded.primary_output.as_ref().map(|item| item.endpoint_id.as_str()),
            Some("speaker-id")
        );
        assert_eq!(
            loaded.fallback_output.as_ref().map(|item| item.endpoint_id.as_str()),
            Some("hdmi-id")
        );
        std::fs::remove_dir_all(&dir).ok();
    }
}
