use super::eq::{EQ_GAIN_MAX_DB, EQ_GAIN_MIN_DB, NUM_EQ_BANDS};

/// Named preset identifiers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EqPreset {
    Flat,
    Gaming,
    Music,
    VoiceClarity,
    BassBoost,
    Custom,
}

impl EqPreset {
    pub fn as_str(self) -> &'static str {
        match self {
            EqPreset::Flat => "flat",
            EqPreset::Gaming => "gaming",
            EqPreset::Music => "music",
            EqPreset::VoiceClarity => "voice_clarity",
            EqPreset::BassBoost => "bass_boost",
            EqPreset::Custom => "custom",
        }
    }

    pub fn from_str(s: &str) -> EqPreset {
        match s {
            "flat" => EqPreset::Flat,
            "gaming" => EqPreset::Gaming,
            "music" => EqPreset::Music,
            "voice_clarity" => EqPreset::VoiceClarity,
            "bass_boost" => EqPreset::BassBoost,
            _ => EqPreset::Custom,
        }
    }

    pub fn to_index(self) -> u32 {
        match self {
            EqPreset::Flat => 0,
            EqPreset::Gaming => 1,
            EqPreset::Music => 2,
            EqPreset::VoiceClarity => 3,
            EqPreset::BassBoost => 4,
            EqPreset::Custom => 5,
        }
    }

    pub fn from_index(idx: u32) -> EqPreset {
        match idx {
            0 => EqPreset::Flat,
            1 => EqPreset::Gaming,
            2 => EqPreset::Music,
            3 => EqPreset::VoiceClarity,
            4 => EqPreset::BassBoost,
            _ => EqPreset::Custom,
        }
    }
}

/// Band gains in dB for each named preset.
/// Bands: [100 Hz, 250 Hz, 1 kHz, 4 kHz, 10 kHz]
pub fn preset_band_gains(preset: EqPreset) -> [f32; NUM_EQ_BANDS] {
    match preset {
        EqPreset::Flat => [0.0, 0.0, 0.0, 0.0, 0.0],
        // Low rumble + upper-mid presence boost for footsteps/spatial cues
        EqPreset::Gaming => [2.0, 1.0, -1.0, 3.0, 2.0],
        // Gentle smile curve: warm lows + airy highs
        EqPreset::Music => [3.0, 1.0, 0.0, 1.0, 3.0],
        // Cut low mud, lift speech mids and presence
        EqPreset::VoiceClarity => [-3.0, -1.0, 2.0, 3.0, 1.0],
        // Strong sub/bass lift, neutral mids/highs
        EqPreset::BassBoost => [6.0, 4.0, 0.0, 0.0, 0.0],
        EqPreset::Custom => [0.0, 0.0, 0.0, 0.0, 0.0],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL_NAMED: &[EqPreset] = &[
        EqPreset::Flat,
        EqPreset::Gaming,
        EqPreset::Music,
        EqPreset::VoiceClarity,
        EqPreset::BassBoost,
    ];

    #[test]
    fn each_preset_returns_correct_band_count() {
        for &p in ALL_NAMED {
            let gains = preset_band_gains(p);
            assert_eq!(
                gains.len(),
                NUM_EQ_BANDS,
                "{:?} should return {} bands",
                p,
                NUM_EQ_BANDS
            );
        }
    }

    #[test]
    fn each_preset_gains_finite_and_within_range() {
        for &p in ALL_NAMED {
            for &g in preset_band_gains(p).iter() {
                assert!(g.is_finite(), "{:?} gain {g} is not finite", p);
                assert!(
                    g >= EQ_GAIN_MIN_DB && g <= EQ_GAIN_MAX_DB,
                    "{:?} gain {g} is outside ±12 dB",
                    p
                );
            }
        }
    }

    #[test]
    fn flat_preset_is_all_zeros() {
        assert_eq!(preset_band_gains(EqPreset::Flat), [0.0_f32; NUM_EQ_BANDS]);
    }

    #[test]
    fn round_trip_str_index() {
        for &p in ALL_NAMED {
            let s = p.as_str();
            let back = EqPreset::from_str(s);
            assert_eq!(p, back, "from_str(as_str({:?})) should round-trip", p);

            let idx = p.to_index();
            let back2 = EqPreset::from_index(idx);
            assert_eq!(p, back2, "from_index(to_index({:?})) should round-trip", p);
        }
    }

    #[test]
    fn unknown_str_gives_custom() {
        assert_eq!(EqPreset::from_str("unknown_preset"), EqPreset::Custom);
        assert_eq!(EqPreset::from_str(""), EqPreset::Custom);
    }
}
