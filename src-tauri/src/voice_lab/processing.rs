use crate::audio_engine::dsp::biquad::{BiquadCoeffs, BiquadState};
use crate::audio_engine::dsp::filters::{default_q, highpass_coeffs};
use crate::audio_engine::dsp::gain::db_to_linear;
use crate::audio_engine::dsp::limiter::soft_limit;

use super::types::VoiceLabSettings;

/// Real-time voice processing chain: gain → HP filter → noise gate → limiter.
/// Stateful, allocation-free after construction.
pub struct VoiceChain {
    sample_rate: f32,
    channels: usize,
    // Input gain
    gain: f32,
    // High-pass filter (per channel)
    hp_enabled: bool,
    hp_coeffs: BiquadCoeffs,
    hp_states: Vec<BiquadState>,
    // Noise gate
    gate_enabled: bool,
    gate_threshold: f32,
    gate_attack_coeff: f32,
    gate_release_coeff: f32,
    gate_env: f32,
    gate_open: bool,
    gate_gain: f32,
    // Limiter
    limiter_enabled: bool,
}

impl VoiceChain {
    pub fn new(sample_rate: f32, channels: usize, settings: &VoiceLabSettings) -> Self {
        let channels = channels.max(1);
        let mut chain = Self {
            sample_rate,
            channels,
            gain: 1.0,
            hp_enabled: false,
            hp_coeffs: BiquadCoeffs::IDENTITY,
            hp_states: vec![BiquadState::default(); channels],
            gate_enabled: false,
            gate_threshold: 0.001,
            gate_attack_coeff: 0.0,
            gate_release_coeff: 0.0,
            gate_env: 0.0,
            gate_open: true,
            gate_gain: 1.0,
            limiter_enabled: true,
        };
        chain.apply_settings(settings);
        chain
    }

    pub fn update(&mut self, settings: &VoiceLabSettings) {
        self.apply_settings(settings);
    }

    fn apply_settings(&mut self, settings: &VoiceLabSettings) {
        self.gain = db_to_linear(settings.input_gain_db);
        self.hp_enabled = settings.high_pass_enabled;
        let hp_hz = settings.high_pass_hz.clamp(1.0, self.sample_rate * 0.49);
        self.hp_coeffs = highpass_coeffs(hp_hz, self.sample_rate, default_q());
        self.gate_enabled = settings.gate_enabled;
        // Gate threshold: db_to_linear of a negative dB value
        self.gate_threshold = db_to_linear(settings.gate_threshold_db);
        // Attack: ~1 ms
        let attack_samples = (0.001 * self.sample_rate).max(1.0);
        self.gate_attack_coeff = (-1.0_f32 / attack_samples).exp();
        // Release: configurable
        let release_samples = (settings.gate_release_ms * 0.001 * self.sample_rate).max(1.0);
        self.gate_release_coeff = (-1.0_f32 / release_samples).exp();
        self.limiter_enabled = settings.limiter_enabled;
    }

    /// Process one interleaved f32 sample. channel_index is 0..channels-1.
    #[inline]
    pub fn process(&mut self, x: f32, channel_index: usize) -> f32 {
        let ci = channel_index % self.channels;

        // 1. Input gain
        let y = x * self.gain;

        // 2. High-pass filter (per channel)
        let y = if self.hp_enabled {
            self.hp_states[ci].process(y, &self.hp_coeffs)
        } else {
            y
        };

        // 3. Noise gate — envelope follower on channel 0, gate_gain applied to all
        let y = if self.gate_enabled {
            if ci == 0 {
                let abs = y.abs();
                let coeff = if abs > self.gate_env {
                    self.gate_attack_coeff
                } else {
                    self.gate_release_coeff
                };
                self.gate_env = coeff * self.gate_env + (1.0 - coeff) * abs;
                self.gate_open = self.gate_env >= self.gate_threshold;
                self.gate_gain = if self.gate_open { 1.0 } else { 0.0 };
            }
            y * self.gate_gain
        } else {
            self.gate_open = true;
            self.gate_gain = 1.0;
            y
        };

        // 4. Limiter
        if self.limiter_enabled {
            soft_limit(y)
        } else {
            y
        }
    }

    pub fn gate_open(&self) -> bool {
        self.gate_open
    }
}
