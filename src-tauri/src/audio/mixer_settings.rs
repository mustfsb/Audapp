use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

const SETTINGS_FILE: &str = "mixer-channel-settings.json";
const CURRENT_SCHEMA_VERSION: u32 = 1;

pub const KNOWN_CHANNEL_IDS: &[&str] = &["general", "music", "game", "browser"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MixerChannelSetting {
    pub channel_id: String,
    pub volume_percent: u8,
    pub muted: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedMixerSettingsFile {
    schema_version: u32,
    saved_at: String,
    channels: Vec<MixerChannelSetting>,
}

#[derive(Debug, Clone)]
pub enum MixerSettingsError {
    Io(String),
    InvalidInput(String),
}

impl MixerSettingsError {
    pub fn message(&self) -> String {
        match self {
            Self::Io(message) | Self::InvalidInput(message) => message.clone(),
        }
    }
}

pub fn settings_file_path(base_dir: &Path) -> PathBuf {
    base_dir.join(SETTINGS_FILE)
}

pub fn load_mixer_channel_settings(base_dir: &Path) -> Vec<MixerChannelSetting> {
    let path = settings_file_path(base_dir);
    let bytes = match fs::read(&path) {
        Ok(b) => b,
        Err(_) => return Vec::new(),
    };

    let file: PersistedMixerSettingsFile = match serde_json::from_slice(&bytes) {
        Ok(f) => f,
        Err(error) => {
            eprintln!(
                "mixer-channel-settings.json is invalid, using defaults: {error}"
            );
            return Vec::new();
        }
    };

    if file.schema_version != CURRENT_SCHEMA_VERSION {
        eprintln!(
            "mixer-channel-settings.json schema version {} is unsupported, using defaults",
            file.schema_version
        );
        return Vec::new();
    }

    file.channels
        .into_iter()
        .filter(|entry| is_known_channel_id(&entry.channel_id))
        .map(clamp_setting)
        .collect()
}

pub fn save_mixer_channel_settings(
    base_dir: &Path,
    channels: &[MixerChannelSetting],
) -> Result<(), MixerSettingsError> {
    fs::create_dir_all(base_dir).map_err(|error| {
        MixerSettingsError::Io(format!("Failed to create app data directory: {error}"))
    })?;

    let file = PersistedMixerSettingsFile {
        schema_version: CURRENT_SCHEMA_VERSION,
        saved_at: Utc::now().to_rfc3339(),
        channels: channels
            .iter()
            .cloned()
            .map(clamp_setting)
            .collect(),
    };

    let json = serde_json::to_string_pretty(&file).map_err(|error| {
        MixerSettingsError::Io(format!("Failed to serialize mixer settings: {error}"))
    })?;

    atomic_write(&settings_file_path(base_dir), &json)
}

pub fn upsert_mixer_channel_setting(
    base_dir: &Path,
    channel_id: String,
    volume_percent: u8,
    muted: bool,
) -> Result<MixerChannelSetting, MixerSettingsError> {
    if !is_known_channel_id(&channel_id) {
        return Err(MixerSettingsError::InvalidInput(format!(
            "Unknown channel id: {channel_id}"
        )));
    }

    let mut channels = load_mixer_channel_settings(base_dir);
    let now = Utc::now().to_rfc3339();
    let entry = MixerChannelSetting {
        channel_id: channel_id.clone(),
        volume_percent,
        muted,
        updated_at: now,
    };
    let clamped = clamp_setting(entry);

    if let Some(existing) = channels
        .iter_mut()
        .find(|item| item.channel_id == channel_id)
    {
        *existing = clamped.clone();
    } else {
        channels.push(clamped.clone());
    }

    save_mixer_channel_settings(base_dir, &channels)?;
    Ok(clamped)
}

pub fn reset_mixer_channel_settings(base_dir: &Path) -> Result<(), MixerSettingsError> {
    let path = settings_file_path(base_dir);
    if path.exists() {
        fs::remove_file(&path).map_err(|error| {
            MixerSettingsError::Io(format!("Failed to delete mixer settings file: {error}"))
        })?;
    }
    Ok(())
}

fn is_known_channel_id(channel_id: &str) -> bool {
    KNOWN_CHANNEL_IDS.contains(&channel_id)
}

fn clamp_setting(mut setting: MixerChannelSetting) -> MixerChannelSetting {
    setting.volume_percent = setting.volume_percent.min(100);
    setting
}

fn atomic_write(path: &Path, contents: &str) -> Result<(), MixerSettingsError> {
    let parent = path.parent().ok_or_else(|| {
        MixerSettingsError::Io("Mixer settings path has no parent directory.".to_string())
    })?;

    let temp_path = parent.join(format!(
        "{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(SETTINGS_FILE)
    ));

    fs::write(&temp_path, contents).map_err(|error| {
        MixerSettingsError::Io(format!("Failed to write mixer settings temp file: {error}"))
    })?;

    if path.exists() {
        fs::remove_file(path).map_err(|error| {
            MixerSettingsError::Io(format!("Failed to replace mixer settings file: {error}"))
        })?;
    }

    fs::rename(&temp_path, path).map_err(|error| {
        MixerSettingsError::Io(format!("Failed to finalize mixer settings file: {error}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("audapp-mixer-{nanos}"))
    }

    #[test]
    fn missing_file_returns_empty() {
        let dir = temp_dir();
        let settings = load_mixer_channel_settings(&dir);
        assert!(settings.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn malformed_json_returns_empty() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        fs::write(settings_file_path(&dir), b"not json").unwrap();
        let settings = load_mixer_channel_settings(&dir);
        assert!(settings.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn upsert_and_load_round_trip() {
        let dir = temp_dir();
        let saved = upsert_mixer_channel_setting(&dir, "browser".to_string(), 42, true)
            .expect("upsert");
        assert_eq!(saved.volume_percent, 42);
        assert!(saved.muted);

        let loaded = load_mixer_channel_settings(&dir);
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].channel_id, "browser");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn volume_is_clamped() {
        let dir = temp_dir();
        let saved = upsert_mixer_channel_setting(&dir, "general".to_string(), 255, false)
            .expect("upsert");
        assert_eq!(saved.volume_percent, 100);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn unknown_channel_is_rejected() {
        let dir = temp_dir();
        let result = upsert_mixer_channel_setting(&dir, "system".to_string(), 50, false);
        assert!(result.is_err());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn reset_removes_file() {
        let dir = temp_dir();
        upsert_mixer_channel_setting(&dir, "game".to_string(), 55, false).expect("upsert");
        reset_mixer_channel_settings(&dir).expect("reset");
        assert!(!settings_file_path(&dir).exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn supports_phase_21h_internal_channel_ids() {
        assert!(KNOWN_CHANNEL_IDS.contains(&"general"));
        assert!(KNOWN_CHANNEL_IDS.contains(&"music"));
        assert!(KNOWN_CHANNEL_IDS.contains(&"game"));
        assert!(KNOWN_CHANNEL_IDS.contains(&"browser"));
        // Phase 21H retired the "voice" output channel in favor of "browser".
        assert!(!KNOWN_CHANNEL_IDS.contains(&"voice"));
    }
}
