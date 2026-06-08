//! Per-channel DSP for the multichannel bridge.
//!
//! Each Audapp channel (general / music / game / browser) owns an independent,
//! full DSP config (enable, output gain, high-/low-pass, EQ bands + preset).
//! The multichannel worker runs each source through its own DSP pipeline
//! *before* mixing; the master pipeline + limiter run on the summed output.
//!
//! State reuses the same `DspConfigShared` atomic block as the master DSP, so
//! per-channel pipelines share all the existing biquad/EQ/preset code.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::audio_engine::dsp::config::{
    get_config_from, set_config_into, set_eq_preset_into, DspConfigShared,
};
use crate::audio_engine::dsp::types::DspRuntimeConfig;

const CHANNEL_IDS: [&str; 4] = ["general", "music", "game", "browser"];
const CONFIG_FILE_NAME: &str = "channel-dsp-config.json";
const CURRENT_SCHEMA_VERSION: u32 = 2;

/// Full per-channel DSP config. `dsp` is flattened so the wire format is
/// `{ channelId, enabled, outputGainDb, eqBands, ... }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelDspConfig {
    pub channel_id: String,
    #[serde(flatten)]
    pub dsp: DspRuntimeConfig,
}

/// Default per-channel config: enabled but fully transparent (0 dB, flat EQ,
/// filters off). Enabled-by-default means the channel's output gain and EQ take
/// effect as soon as the user touches them, without a separate toggle step.
fn default_channel_dsp() -> DspRuntimeConfig {
    DspRuntimeConfig {
        enabled: true,
        ..DspRuntimeConfig::default()
    }
}

fn default_channel_config(channel_id: &str) -> ChannelDspConfig {
    ChannelDspConfig {
        channel_id: channel_id.to_string(),
        dsp: default_channel_dsp(),
    }
}

struct AllChannelDspState {
    general: DspConfigShared,
    music: DspConfigShared,
    game: DspConfigShared,
    browser: DspConfigShared,
}

impl AllChannelDspState {
    fn new() -> Self {
        Self {
            general: DspConfigShared::from_config(&default_channel_dsp()),
            music: DspConfigShared::from_config(&default_channel_dsp()),
            game: DspConfigShared::from_config(&default_channel_dsp()),
            browser: DspConfigShared::from_config(&default_channel_dsp()),
        }
    }

    fn state(&self, channel_id: &str) -> Option<&DspConfigShared> {
        match channel_id {
            "general" => Some(&self.general),
            "music" => Some(&self.music),
            "game" => Some(&self.game),
            "browser" => Some(&self.browser),
            _ => None,
        }
    }
}

static STATE: OnceLock<AllChannelDspState> = OnceLock::new();

fn global() -> &'static AllChannelDspState {
    STATE.get_or_init(AllChannelDspState::new)
}

/// Returns the `'static` shared-config block for a channel, used by the worker to
/// prepare a per-source `DspPipeline`. Returns `None` for unknown channel ids.
pub fn channel_dsp_shared(channel_id: &str) -> Option<&'static DspConfigShared> {
    global().state(channel_id)
}

pub fn get_channel_dsp(channel_id: &str) -> Option<ChannelDspConfig> {
    let shared = global().state(channel_id)?;
    Some(ChannelDspConfig {
        channel_id: channel_id.to_string(),
        dsp: get_config_from(shared),
    })
}

pub fn set_channel_dsp(config: ChannelDspConfig) -> Result<ChannelDspConfig, String> {
    let shared = global()
        .state(&config.channel_id)
        .ok_or_else(|| format!("Unknown channel: {}", config.channel_id))?;
    set_config_into(shared, config.dsp);
    Ok(ChannelDspConfig {
        channel_id: config.channel_id.clone(),
        dsp: get_config_from(shared),
    })
}

pub fn set_channel_eq_preset(channel_id: &str, preset: &str) -> Result<ChannelDspConfig, String> {
    let shared = global()
        .state(channel_id)
        .ok_or_else(|| format!("Unknown channel: {channel_id}"))?;
    set_eq_preset_into(shared, preset);
    Ok(ChannelDspConfig {
        channel_id: channel_id.to_string(),
        dsp: get_config_from(shared),
    })
}

pub fn get_all_channel_dsps() -> Vec<ChannelDspConfig> {
    CHANNEL_IDS
        .iter()
        .map(|id| get_channel_dsp(id).unwrap_or_else(|| default_channel_config(id)))
        .collect()
}

// --- Persistence ---

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedFile {
    schema_version: u32,
    saved_at: String,
    channels: Vec<ChannelDspConfig>,
}

/// Legacy Phase 22F entry: per-channel gain only.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyChannelConfigV1 {
    channel_id: String,
    enabled: bool,
    gain_db: f32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyFileV1 {
    channels: Vec<LegacyChannelConfigV1>,
}

fn config_file_path(data_dir: &Path) -> PathBuf {
    data_dir.join(CONFIG_FILE_NAME)
}

fn default_configs() -> Vec<ChannelDspConfig> {
    CHANNEL_IDS
        .iter()
        .map(|id| default_channel_config(id))
        .collect()
}

/// Merge loaded configs over defaults so every channel is always present.
fn merge_with_defaults(loaded: Vec<ChannelDspConfig>) -> Vec<ChannelDspConfig> {
    let mut result = default_configs();
    for entry in loaded {
        if let Some(slot) = result.iter_mut().find(|c| c.channel_id == entry.channel_id) {
            *slot = entry;
        }
    }
    result
}

/// Migrate Phase 22F (v1, gain-only) entries into full channel configs.
fn migrate_v1(channels: Vec<LegacyChannelConfigV1>) -> Vec<ChannelDspConfig> {
    let migrated = channels
        .into_iter()
        .map(|c| {
            let mut dsp = default_channel_dsp();
            dsp.enabled = c.enabled;
            dsp.output_gain_db = c.gain_db;
            ChannelDspConfig {
                channel_id: c.channel_id,
                dsp,
            }
        })
        .collect();
    merge_with_defaults(migrated)
}

/// Load per-channel DSP configs from disk. Missing/invalid files fall back to
/// all defaults; v1 (gain-only) files are migrated to full configs.
pub fn load_channel_dsp_configs(data_dir: &Path) -> Vec<ChannelDspConfig> {
    let path = config_file_path(data_dir);
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(_) => return default_configs(),
    };
    let value: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(_) => return default_configs(),
    };
    let version = value
        .get("schemaVersion")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    match version {
        CURRENT_SCHEMA_VERSION => serde_json::from_value::<PersistedFile>(value)
            .map(|file| merge_with_defaults(file.channels))
            .unwrap_or_else(|_| default_configs()),
        1 => serde_json::from_value::<LegacyFileV1>(value)
            .map(|file| migrate_v1(file.channels))
            .unwrap_or_else(|_| default_configs()),
        _ => default_configs(),
    }
}

/// Persist all current in-memory channel DSP configs to disk (atomic rename).
pub fn save_channel_dsp_configs(data_dir: &Path) -> Result<(), String> {
    let path = config_file_path(data_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("failed to create data dir: {e}"))?;
    }
    let file = PersistedFile {
        schema_version: CURRENT_SCHEMA_VERSION,
        saved_at: chrono::Utc::now().to_rfc3339(),
        channels: get_all_channel_dsps(),
    };
    let json =
        serde_json::to_string_pretty(&file).map_err(|e| format!("failed to serialize: {e}"))?;
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, json.as_bytes()).map_err(|e| format!("failed to write tmp: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("failed to rename: {e}"))?;
    Ok(())
}

/// Apply persisted (or default) configs to the in-memory global state.
pub fn init_channel_dsp(configs: &[ChannelDspConfig]) {
    for config in configs {
        let _ = set_channel_dsp(config.clone());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_engine::dsp::config::get_config_from;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        use uuid::Uuid;
        let dir = std::env::temp_dir().join(format!("audapp_ch_dsp_{tag}_{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn defaults_contain_all_four_channels() {
        let configs = default_configs();
        assert_eq!(configs.len(), 4);
        let ids: Vec<&str> = configs.iter().map(|c| c.channel_id.as_str()).collect();
        for id in ["general", "music", "game", "browser"] {
            assert!(ids.contains(&id), "missing channel {id}");
        }
        for cfg in &configs {
            assert!(cfg.dsp.enabled, "default channel should be enabled");
            assert!((cfg.dsp.output_gain_db).abs() < 1e-5, "default gain should be 0 dB");
            assert_eq!(cfg.dsp.eq_bands.len(), 5, "default should have 5 EQ bands");
        }
    }

    #[test]
    fn updating_browser_does_not_change_music() {
        let all = AllChannelDspState::new();
        let mut browser = default_channel_dsp();
        browser.output_gain_db = -12.0;
        browser.eq_enabled = true;
        browser.eq_bands[0].gain_db = 6.0;
        set_config_into(all.state("browser").unwrap(), browser);

        let music = get_config_from(all.state("music").unwrap());
        assert!((music.output_gain_db).abs() < 1e-5, "music gain untouched");
        assert!(!music.eq_enabled, "music EQ untouched");
        assert!((music.eq_bands[0].gain_db).abs() < 1e-5, "music band untouched");

        let browser_now = get_config_from(all.state("browser").unwrap());
        assert!((browser_now.output_gain_db - (-12.0)).abs() < 0.01);
        assert!(browser_now.eq_enabled);
        assert!((browser_now.eq_bands[0].gain_db - 6.0).abs() < 0.01);
    }

    #[test]
    fn negative_gain_attenuation_persists() {
        let all = AllChannelDspState::new();
        let mut cfg = default_channel_dsp();
        cfg.output_gain_db = -18.0;
        set_config_into(all.state("game").unwrap(), cfg);
        let read = get_config_from(all.state("game").unwrap());
        assert!(read.output_gain_db < 0.0, "negative gain should be retained");
        assert!((read.output_gain_db - (-18.0)).abs() < 0.01);
    }

    #[test]
    fn load_missing_file_returns_all_four_defaults() {
        let dir = temp_dir("missing");
        let configs = load_channel_dsp_configs(&dir);
        assert_eq!(configs.len(), 4);
        for cfg in &configs {
            assert!(cfg.dsp.enabled);
            assert!((cfg.dsp.output_gain_db).abs() < 1e-5);
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn save_then_load_roundtrips_full_config_per_channel() {
        let dir = temp_dir("rt");

        let mut music = default_channel_dsp();
        music.output_gain_db = 6.0;
        music.eq_enabled = true;
        music.eq_bands[4].gain_db = 4.5;
        let mut browser = default_channel_dsp();
        browser.output_gain_db = -9.0;
        browser.high_pass_enabled = true;
        browser.high_pass_hz = 120.0;

        let configs = vec![
            ChannelDspConfig { channel_id: "general".into(), dsp: default_channel_dsp() },
            ChannelDspConfig { channel_id: "music".into(), dsp: music },
            ChannelDspConfig { channel_id: "game".into(), dsp: default_channel_dsp() },
            ChannelDspConfig { channel_id: "browser".into(), dsp: browser },
        ];

        let file = PersistedFile {
            schema_version: CURRENT_SCHEMA_VERSION,
            saved_at: "2026-06-08T00:00:00Z".into(),
            channels: configs,
        };
        let json = serde_json::to_string_pretty(&file).unwrap();
        std::fs::write(dir.join(CONFIG_FILE_NAME), json).unwrap();

        let loaded = load_channel_dsp_configs(&dir);
        assert_eq!(loaded.len(), 4);

        let m = loaded.iter().find(|c| c.channel_id == "music").unwrap();
        assert!((m.dsp.output_gain_db - 6.0).abs() < 0.01, "music gain persisted");
        assert!(m.dsp.eq_enabled, "music EQ enabled persisted");
        assert!((m.dsp.eq_bands[4].gain_db - 4.5).abs() < 0.01, "music band persisted");

        let b = loaded.iter().find(|c| c.channel_id == "browser").unwrap();
        assert!((b.dsp.output_gain_db - (-9.0)).abs() < 0.01, "browser gain persisted");
        assert!(b.dsp.high_pass_enabled, "browser HPF persisted");

        // Browser edits did not bleed into music's persisted bands.
        assert!((m.dsp.eq_bands[0].gain_db).abs() < 1e-5);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn preset_persists_independently_per_channel() {
        let dir = temp_dir("preset");

        // bass_boost band gains: [6, 4, 0, 0, 0]
        let mut g = default_channel_dsp();
        g.eq_enabled = true;
        let gains = [6.0, 4.0, 0.0, 0.0, 0.0];
        for (i, band) in g.eq_bands.iter_mut().enumerate() {
            band.gain_db = gains[i];
        }

        let configs = vec![
            ChannelDspConfig { channel_id: "general".into(), dsp: default_channel_dsp() },
            ChannelDspConfig { channel_id: "music".into(), dsp: default_channel_dsp() },
            ChannelDspConfig { channel_id: "game".into(), dsp: g },
            ChannelDspConfig { channel_id: "browser".into(), dsp: default_channel_dsp() },
        ];

        let file = PersistedFile {
            schema_version: CURRENT_SCHEMA_VERSION,
            saved_at: "2026-06-08T00:00:00Z".into(),
            channels: configs,
        };
        std::fs::write(
            dir.join(CONFIG_FILE_NAME),
            serde_json::to_string_pretty(&file).unwrap(),
        )
        .unwrap();

        // Apply to a fresh state set and confirm preset detection per channel.
        let all = AllChannelDspState::new();
        for cfg in load_channel_dsp_configs(&dir) {
            set_config_into(all.state(&cfg.channel_id).unwrap(), cfg.dsp);
        }
        let game_cfg = get_config_from(all.state("game").unwrap());
        assert_eq!(game_cfg.eq_preset, "bass_boost", "game preset detected");
        let music_cfg = get_config_from(all.state("music").unwrap());
        assert_eq!(music_cfg.eq_preset, "flat", "music stays flat");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn migrates_legacy_v1_gain_only_into_full_configs() {
        let dir = temp_dir("v1");
        let legacy = r#"{
            "schemaVersion": 1,
            "savedAt": "2026-06-05T00:00:00Z",
            "channels": [
                { "channelId": "general", "enabled": true, "gainDb": 0.0 },
                { "channelId": "music", "enabled": true, "gainDb": 6.0 },
                { "channelId": "game", "enabled": false, "gainDb": -3.0 },
                { "channelId": "browser", "enabled": true, "gainDb": -12.0 }
            ]
        }"#;
        std::fs::write(dir.join(CONFIG_FILE_NAME), legacy).unwrap();

        let loaded = load_channel_dsp_configs(&dir);
        assert_eq!(loaded.len(), 4, "migration yields all four channels");

        let music = loaded.iter().find(|c| c.channel_id == "music").unwrap();
        assert!((music.dsp.output_gain_db - 6.0).abs() < 0.01, "v1 gain → outputGainDb");
        assert_eq!(music.dsp.eq_bands.len(), 5, "migrated config has full EQ bands");
        assert!(music.dsp.enabled);

        let browser = loaded.iter().find(|c| c.channel_id == "browser").unwrap();
        assert!((browser.dsp.output_gain_db - (-12.0)).abs() < 0.01);

        let game = loaded.iter().find(|c| c.channel_id == "game").unwrap();
        assert!(!game.dsp.enabled, "disabled flag migrated");

        std::fs::remove_dir_all(&dir).ok();
    }
}
