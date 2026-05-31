use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::types::DspRuntimeConfig;

const CONFIG_FILE_NAME: &str = "engine-lab-dsp-config.json";
const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PersistedDspConfigFile {
    pub schema_version: u32,
    pub saved_at: String,
    pub dsp: DspRuntimeConfig,
}

pub fn config_file_path(data_dir: &Path) -> PathBuf {
    data_dir.join(CONFIG_FILE_NAME)
}

pub fn load_dsp_config(data_dir: &Path) -> DspRuntimeConfig {
    let path = config_file_path(data_dir);
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(_) => return DspRuntimeConfig::default(),
    };
    let file: PersistedDspConfigFile = match serde_json::from_slice(&bytes) {
        Ok(f) => f,
        Err(_) => return DspRuntimeConfig::default(),
    };
    if file.schema_version != CURRENT_SCHEMA_VERSION {
        return DspRuntimeConfig::default();
    }
    clamp_config(file.dsp)
}

pub fn save_dsp_config(data_dir: &Path, config: &DspRuntimeConfig) -> Result<(), String> {
    let path = config_file_path(data_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create data dir: {e}"))?;
    }
    let file = PersistedDspConfigFile {
        schema_version: CURRENT_SCHEMA_VERSION,
        saved_at: chrono::Utc::now().to_rfc3339(),
        dsp: config.clone(),
    };
    let json = serde_json::to_string_pretty(&file)
        .map_err(|e| format!("failed to serialize DSP config: {e}"))?;
    let tmp_path = path.with_extension("tmp");
    std::fs::write(&tmp_path, json.as_bytes())
        .map_err(|e| format!("failed to write tmp file: {e}"))?;
    std::fs::rename(&tmp_path, &path)
        .map_err(|e| format!("failed to rename tmp to final: {e}"))?;
    Ok(())
}

pub fn reset_persisted_dsp_config(data_dir: &Path) -> Result<(), String> {
    let path = config_file_path(data_dir);
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("failed to delete persisted config: {e}"))?;
    }
    Ok(())
}

fn clamp_config(mut config: DspRuntimeConfig) -> DspRuntimeConfig {
    config.output_gain_db = config.output_gain_db.clamp(-24.0, 12.0);
    config.input_gain_db = config.input_gain_db.clamp(-24.0, 12.0);
    config.high_pass_hz = config.high_pass_hz.clamp(20.0, 300.0);
    config.low_pass_hz = config.low_pass_hz.clamp(4000.0, 20000.0);
    for band in &mut config.eq_bands {
        band.gain_db = band.gain_db.clamp(-12.0, 12.0);
    }
    config
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir() -> PathBuf {
        use uuid::Uuid;
        let dir = std::env::temp_dir().join(format!("audapp_dsp_test_{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn missing_config_returns_defaults() {
        let dir = temp_dir();
        let config = load_dsp_config(&dir);
        assert!(!config.enabled, "defaults: enabled=false");
        assert_eq!(config.output_gain_db, 0.0, "defaults: output_gain=0");
        assert!(config.limiter_enabled, "defaults: limiter=true");
        assert_eq!(config.eq_preset, "flat");
        assert_eq!(config.eq_bands.len(), 5);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn malformed_json_returns_defaults() {
        let dir = temp_dir();
        fs::write(dir.join(CONFIG_FILE_NAME), b"not valid json {{{{").unwrap();
        let config = load_dsp_config(&dir);
        assert!(!config.enabled, "defaults on malformed JSON");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn save_then_load_roundtrip() {
        let dir = temp_dir();
        let mut config = DspRuntimeConfig::default();
        config.enabled = true;
        config.output_gain_db = 3.5;
        config.limiter_enabled = false;
        config.eq_preset = "gaming".to_string();
        config.eq_enabled = true;
        if let Some(band) = config.eq_bands.get_mut(0) {
            band.gain_db = 6.0;
        }

        save_dsp_config(&dir, &config).unwrap();
        let loaded = load_dsp_config(&dir);

        assert_eq!(loaded.enabled, true);
        assert!((loaded.output_gain_db - 3.5).abs() < 0.001);
        assert_eq!(loaded.limiter_enabled, false);
        assert_eq!(loaded.eq_preset, "gaming");
        assert_eq!(loaded.eq_bands[0].gain_db, 6.0);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn invalid_gain_clamped_on_load() {
        let dir = temp_dir();
        let raw = r#"{"schemaVersion":1,"savedAt":"2026-01-01T00:00:00Z","dsp":{"enabled":true,"outputGainDb":999.0,"inputGainDb":0.0,"highPassEnabled":false,"highPassHz":80.0,"lowPassEnabled":false,"lowPassHz":18000.0,"limiterEnabled":true,"eqEnabled":false,"eqPreset":"flat","eqBands":[{"id":"band_100hz","frequencyHz":100.0,"gainDb":0.0,"enabled":true},{"id":"band_250hz","frequencyHz":250.0,"gainDb":0.0,"enabled":true},{"id":"band_1000hz","frequencyHz":1000.0,"gainDb":0.0,"enabled":true},{"id":"band_4000hz","frequencyHz":4000.0,"gainDb":0.0,"enabled":true},{"id":"band_10000hz","frequencyHz":10000.0,"gainDb":0.0,"enabled":true}]}}"#;
        fs::write(dir.join(CONFIG_FILE_NAME), raw).unwrap();
        let config = load_dsp_config(&dir);
        assert!(config.output_gain_db <= 12.0, "output_gain clamped to max");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reset_removes_file() {
        let dir = temp_dir();
        let config = DspRuntimeConfig::default();
        save_dsp_config(&dir, &config).unwrap();
        assert!(dir.join(CONFIG_FILE_NAME).exists());
        reset_persisted_dsp_config(&dir).unwrap();
        assert!(!dir.join(CONFIG_FILE_NAME).exists());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn save_creates_directory_if_missing() {
        use uuid::Uuid;
        let dir = std::env::temp_dir().join(format!("audapp_no_exist_{}", Uuid::new_v4()));
        assert!(!dir.exists(), "dir must not exist before test");
        let config = DspRuntimeConfig::default();
        save_dsp_config(&dir, &config).unwrap();
        assert!(dir.join(CONFIG_FILE_NAME).exists());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn unknown_schema_version_falls_back_to_defaults() {
        let dir = temp_dir();
        let raw = r#"{"schemaVersion":99,"savedAt":"2026-01-01T00:00:00Z","dsp":{"enabled":true,"outputGainDb":0.0,"inputGainDb":0.0,"highPassEnabled":false,"highPassHz":80.0,"lowPassEnabled":false,"lowPassHz":18000.0,"limiterEnabled":true,"eqEnabled":false,"eqPreset":"flat","eqBands":[{"id":"band_100hz","frequencyHz":100.0,"gainDb":0.0,"enabled":true},{"id":"band_250hz","frequencyHz":250.0,"gainDb":0.0,"enabled":true},{"id":"band_1000hz","frequencyHz":1000.0,"gainDb":0.0,"enabled":true},{"id":"band_4000hz","frequencyHz":4000.0,"gainDb":0.0,"enabled":true},{"id":"band_10000hz","frequencyHz":10000.0,"gainDb":0.0,"enabled":true}]}}"#;
        fs::write(dir.join(CONFIG_FILE_NAME), raw).unwrap();
        let config = load_dsp_config(&dir);
        assert!(!config.enabled, "unknown schema → defaults");
        fs::remove_dir_all(&dir).ok();
    }
}
