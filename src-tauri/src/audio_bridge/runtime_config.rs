use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::OnceLock;

use crate::audio::MixerChannelSetting;

const KNOWN_CHANNEL_IDS: [&str; 4] = ["general", "music", "game", "browser"];

pub struct RuntimeChannelState {
    volume_percent: AtomicU8,
    muted: AtomicBool,
}

impl RuntimeChannelState {
    const fn new() -> Self {
        Self {
            volume_percent: AtomicU8::new(100),
            muted: AtomicBool::new(false),
        }
    }

    fn update(&self, volume_percent: u8, muted: bool) {
        self.volume_percent
            .store(volume_percent.min(100), Ordering::Relaxed);
        self.muted.store(muted, Ordering::Relaxed);
    }

    fn snapshot(&self, channel_id: &'static str) -> RuntimeChannelSnapshot {
        RuntimeChannelSnapshot {
            channel_id,
            volume_percent: self.volume_percent.load(Ordering::Relaxed),
            muted: self.muted.load(Ordering::Relaxed),
        }
    }
}

pub struct BridgeRuntimeConfig {
    general: RuntimeChannelState,
    music: RuntimeChannelState,
    game: RuntimeChannelState,
    browser: RuntimeChannelState,
}

impl BridgeRuntimeConfig {
    const fn new() -> Self {
        Self {
            general: RuntimeChannelState::new(),
            music: RuntimeChannelState::new(),
            game: RuntimeChannelState::new(),
            browser: RuntimeChannelState::new(),
        }
    }

    fn state(&self, channel_id: &str) -> Option<&RuntimeChannelState> {
        match channel_id {
            "general" => Some(&self.general),
            "music" => Some(&self.music),
            "game" => Some(&self.game),
            "browser" => Some(&self.browser),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeChannelSnapshot {
    pub channel_id: &'static str,
    pub volume_percent: u8,
    pub muted: bool,
}

static CONFIG: OnceLock<BridgeRuntimeConfig> = OnceLock::new();

fn global() -> &'static BridgeRuntimeConfig {
    CONFIG.get_or_init(BridgeRuntimeConfig::new)
}

pub fn init_runtime_channel_config(settings: &[MixerChannelSetting]) {
    reset_runtime_channel_config();

    for setting in settings {
        let _ = update_runtime_channel_config(
            &setting.channel_id,
            setting.volume_percent,
            setting.muted,
        );
    }
}

pub fn update_runtime_channel_config(
    channel_id: &str,
    volume_percent: u8,
    muted: bool,
) -> Result<(), String> {
    let Some(state) = global().state(channel_id) else {
        return Err(format!("Unknown channel id: {channel_id}"));
    };

    state.update(volume_percent, muted);
    Ok(())
}

pub fn runtime_channel_snapshot(channel_id: &str) -> Option<RuntimeChannelSnapshot> {
    let static_id = channel_id_to_static(channel_id)?;
    global()
        .state(channel_id)
        .map(|state| state.snapshot(static_id))
}

pub fn runtime_channel_snapshots() -> Vec<RuntimeChannelSnapshot> {
    KNOWN_CHANNEL_IDS
        .iter()
        .filter_map(|channel_id| runtime_channel_snapshot(channel_id))
        .collect()
}

pub fn channel_gain_linear(channel_id: &str) -> Option<f32> {
    let state = global().state(channel_id)?;
    let muted = state.muted.load(Ordering::Relaxed);
    if muted {
        return Some(0.0);
    }

    Some(state.volume_percent.load(Ordering::Relaxed) as f32 / 100.0)
}

pub fn channel_is_muted(channel_id: &str) -> Option<bool> {
    global()
        .state(channel_id)
        .map(|state| state.muted.load(Ordering::Relaxed))
}

pub fn reset_runtime_channel_config() {
    for channel_id in KNOWN_CHANNEL_IDS {
        let _ = update_runtime_channel_config(channel_id, 100, false);
    }
}

fn channel_id_to_static(channel_id: &str) -> Option<&'static str> {
    match channel_id {
        "general" => Some("general"),
        "music" => Some("music"),
        "game" => Some("game"),
        "browser" => Some("browser"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setting(channel_id: &str, volume_percent: u8, muted: bool) -> MixerChannelSetting {
        MixerChannelSetting {
            channel_id: channel_id.to_string(),
            volume_percent,
            muted,
            updated_at: "2026-06-05T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn init_seeds_runtime_state_from_persisted_settings() {
        init_runtime_channel_config(&[
            setting("general", 88, false),
            setting("browser", 12, true),
        ]);

        assert_eq!(
            runtime_channel_snapshot("general"),
            Some(RuntimeChannelSnapshot {
                channel_id: "general",
                volume_percent: 88,
                muted: false,
            })
        );
        assert_eq!(channel_gain_linear("browser"), Some(0.0));
        assert_eq!(channel_is_muted("browser"), Some(true));
        assert_eq!(
            runtime_channel_snapshot("music"),
            Some(RuntimeChannelSnapshot {
                channel_id: "music",
                volume_percent: 100,
                muted: false,
            })
        );
    }

    #[test]
    fn updates_runtime_state_immediately() {
        reset_runtime_channel_config();

        update_runtime_channel_config("music", 42, false).expect("update music");
        update_runtime_channel_config("music", 17, true).expect("mute music");

        assert_eq!(
            runtime_channel_snapshot("music"),
            Some(RuntimeChannelSnapshot {
                channel_id: "music",
                volume_percent: 17,
                muted: true,
            })
        );
        assert_eq!(channel_gain_linear("music"), Some(0.0));
    }

    #[test]
    fn rejects_unknown_channel_ids() {
        assert_eq!(
            update_runtime_channel_config("system", 50, false),
            Err("Unknown channel id: system".to_string())
        );
    }
}
