use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::OnceLock;

use super::gain::clamp_gain_db;
use super::types::{DspRuntimeConfig, DspRuntimeStatus};

const HP_HZ_MIN: f32 = 20.0;
const HP_HZ_MAX: f32 = 300.0;
const LP_HZ_MIN: f32 = 4000.0;
const LP_HZ_MAX: f32 = 20000.0;

pub struct DspConfigShared {
    // User-writable config
    pub enabled: AtomicBool,
    pub output_gain_db: AtomicU32,   // f32 as bits
    pub input_gain_db: AtomicU32,
    pub high_pass_enabled: AtomicBool,
    pub high_pass_hz: AtomicU32,
    pub low_pass_enabled: AtomicBool,
    pub low_pass_hz: AtomicU32,
    pub version: AtomicU32,          // bumped on every write; worker reads this for cache-invalidation

    // Engine-reported status (written by pipeline, read by status command)
    pub active_in_engine: AtomicBool,
    pub supported: AtomicBool,
    pub unsupported_reason_idx: AtomicU32,  // 0=none, 1=not float32
    pub sample_format_tag: AtomicU32,       // 0=unknown, 1=f32, 2=i16, 3=other
}

static DSP_CONFIG: OnceLock<DspConfigShared> = OnceLock::new();

pub fn global() -> &'static DspConfigShared {
    DSP_CONFIG.get_or_init(|| {
        let d = DspRuntimeConfig::default();
        DspConfigShared {
            enabled: AtomicBool::new(d.enabled),
            output_gain_db: AtomicU32::new(d.output_gain_db.to_bits()),
            input_gain_db: AtomicU32::new(d.input_gain_db.to_bits()),
            high_pass_enabled: AtomicBool::new(d.high_pass_enabled),
            high_pass_hz: AtomicU32::new(d.high_pass_hz.to_bits()),
            low_pass_enabled: AtomicBool::new(d.low_pass_enabled),
            low_pass_hz: AtomicU32::new(d.low_pass_hz.to_bits()),
            version: AtomicU32::new(1),
            active_in_engine: AtomicBool::new(false),
            supported: AtomicBool::new(true),
            unsupported_reason_idx: AtomicU32::new(0),
            sample_format_tag: AtomicU32::new(0),
        }
    })
}

fn clamp_config(c: DspRuntimeConfig) -> DspRuntimeConfig {
    DspRuntimeConfig {
        enabled: c.enabled,
        output_gain_db: clamp_gain_db(c.output_gain_db),
        input_gain_db: clamp_gain_db(c.input_gain_db),
        high_pass_enabled: c.high_pass_enabled,
        high_pass_hz: c.high_pass_hz.clamp(HP_HZ_MIN, HP_HZ_MAX),
        low_pass_enabled: c.low_pass_enabled,
        low_pass_hz: c.low_pass_hz.clamp(LP_HZ_MIN, LP_HZ_MAX),
    }
}

pub fn get_config() -> DspRuntimeConfig {
    let g = global();
    DspRuntimeConfig {
        enabled: g.enabled.load(Ordering::Relaxed),
        output_gain_db: f32::from_bits(g.output_gain_db.load(Ordering::Relaxed)),
        input_gain_db: f32::from_bits(g.input_gain_db.load(Ordering::Relaxed)),
        high_pass_enabled: g.high_pass_enabled.load(Ordering::Relaxed),
        high_pass_hz: f32::from_bits(g.high_pass_hz.load(Ordering::Relaxed)),
        low_pass_enabled: g.low_pass_enabled.load(Ordering::Relaxed),
        low_pass_hz: f32::from_bits(g.low_pass_hz.load(Ordering::Relaxed)),
    }
}

pub fn set_config(config: DspRuntimeConfig) -> DspRuntimeStatus {
    let c = clamp_config(config);
    let g = global();
    g.enabled.store(c.enabled, Ordering::Relaxed);
    g.output_gain_db.store(c.output_gain_db.to_bits(), Ordering::Relaxed);
    g.input_gain_db.store(c.input_gain_db.to_bits(), Ordering::Relaxed);
    g.high_pass_enabled.store(c.high_pass_enabled, Ordering::Relaxed);
    g.high_pass_hz.store(c.high_pass_hz.to_bits(), Ordering::Relaxed);
    g.low_pass_enabled.store(c.low_pass_enabled, Ordering::Relaxed);
    g.low_pass_hz.store(c.low_pass_hz.to_bits(), Ordering::Relaxed);
    g.version.fetch_add(1, Ordering::Relaxed);
    get_status()
}

pub fn reset_config() -> DspRuntimeConfig {
    set_config(DspRuntimeConfig::default());
    get_config()
}

pub fn get_status() -> DspRuntimeStatus {
    let g = global();
    let version = g.version.load(Ordering::Relaxed);
    let active = g.active_in_engine.load(Ordering::Relaxed);
    let supported = g.supported.load(Ordering::Relaxed);
    let enabled = g.enabled.load(Ordering::Relaxed);
    let reason_idx = g.unsupported_reason_idx.load(Ordering::Relaxed);
    let fmt_tag = g.sample_format_tag.load(Ordering::Relaxed);

    let unsupported_reason = if !supported {
        Some(match reason_idx {
            1 => "DSP requires a float32 device mix format.".to_string(),
            _ => "Unsupported device format.".to_string(),
        })
    } else {
        None
    };

    let sample_format = match fmt_tag {
        1 => Some("f32".to_string()),
        2 => Some("i16".to_string()),
        3 => Some("other".to_string()),
        _ => None,
    };

    DspRuntimeStatus {
        enabled,
        active_in_engine: active,
        supported,
        unsupported_reason,
        sample_format,
        config_version: version,
        last_updated_at: chrono::Utc::now().to_rfc3339(),
    }
}
