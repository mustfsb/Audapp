use std::sync::atomic::Ordering;

use super::biquad::{BiquadCoeffs, BiquadState};
use super::config::DspConfigShared;
use super::filters::{default_q, highpass_coeffs, lowpass_coeffs};
use super::gain::db_to_linear;

/// Snapshot of config values cached for a buffer cycle (read once per cycle, never per sample).
/// Only the fields actually used in per-sample processing are kept here.
struct DspSnapshot {
    enabled: bool,
    supported: bool,
    output_gain: f32,
    input_gain: f32,
}

/// Per-engine-run DSP pipeline.
/// Preallocates per-channel filter states in `prepare()`; no heap alloc after that.
pub struct DspPipeline {
    sample_rate: f32,
    channels: usize,
    shared: Option<&'static DspConfigShared>,
    cached_version: u32,
    snapshot: DspSnapshot,
    // Mono output chain (test tone is mono, written to all channels)
    out_hp: BiquadState,
    out_lp: BiquadState,
    out_hp_coeffs: BiquadCoeffs,
    out_lp_coeffs: BiquadCoeffs,
    // Per-channel input chain (capture is multichannel interleaved)
    in_hp_states: Vec<BiquadState>,
    in_lp_states: Vec<BiquadState>,
    in_hp_coeffs: BiquadCoeffs,
    in_lp_coeffs: BiquadCoeffs,
}

impl DspPipeline {
    pub fn new() -> Self {
        Self {
            sample_rate: 48000.0,
            channels: 2,
            shared: None,
            cached_version: 0,
            snapshot: DspSnapshot {
                enabled: false,
                supported: false,
                output_gain: 1.0,
                input_gain: 1.0,
            },
            out_hp: BiquadState::default(),
            out_lp: BiquadState::default(),
            out_hp_coeffs: BiquadCoeffs::IDENTITY,
            out_lp_coeffs: BiquadCoeffs::IDENTITY,
            in_hp_states: Vec::new(),
            in_lp_states: Vec::new(),
            in_hp_coeffs: BiquadCoeffs::IDENTITY,
            in_lp_coeffs: BiquadCoeffs::IDENTITY,
        }
    }

    /// Called once after the WASAPI stream format is known.
    /// Allocates per-channel filter states (before the audio loop starts).
    pub fn prepare(
        &mut self,
        sample_rate: f32,
        channels: usize,
        shared: &'static DspConfigShared,
        is_float: bool,
        bits_per_sample: u16,
    ) {
        self.sample_rate = sample_rate;
        self.channels = channels;
        self.shared = Some(shared);
        // Preallocate per-channel states — no further allocation in process_*
        self.in_hp_states = vec![BiquadState::default(); channels.max(1)];
        self.in_lp_states = vec![BiquadState::default(); channels.max(1)];

        let fmt_tag: u32 = if is_float { 1 } else if bits_per_sample == 16 { 2 } else { 3 };
        shared.sample_format_tag.store(fmt_tag, Ordering::Relaxed);
        shared.supported.store(is_float, Ordering::Relaxed);
        shared.unsupported_reason_idx
            .store(if is_float { 0 } else { 1 }, Ordering::Relaxed);
        shared.active_in_engine.store(true, Ordering::Relaxed);

        // Force a refresh on the first buffer cycle
        self.cached_version = 0;
    }

    /// Called when the engine stops. Clears active_in_engine.
    pub fn deactivate(&self) {
        if let Some(s) = self.shared {
            s.active_in_engine.store(false, Ordering::Relaxed);
        }
    }

    /// Call once per buffer cycle (not per sample).
    /// Reads atomics and recomputes biquad coefficients only if the config version changed.
    #[inline]
    pub fn maybe_refresh(&mut self) {
        let Some(shared) = self.shared else { return };
        let current = shared.version.load(Ordering::Relaxed);
        if current == self.cached_version {
            return;
        }
        self.cached_version = current;

        let enabled = shared.enabled.load(Ordering::Relaxed);
        let supported = shared.supported.load(Ordering::Relaxed);
        let out_gain_db = f32::from_bits(shared.output_gain_db.load(Ordering::Relaxed));
        let in_gain_db = f32::from_bits(shared.input_gain_db.load(Ordering::Relaxed));
        let hp_enabled = shared.high_pass_enabled.load(Ordering::Relaxed);
        let hp_hz = f32::from_bits(shared.high_pass_hz.load(Ordering::Relaxed));
        let lp_enabled = shared.low_pass_enabled.load(Ordering::Relaxed);
        let lp_hz = f32::from_bits(shared.low_pass_hz.load(Ordering::Relaxed));

        self.snapshot = DspSnapshot {
            enabled,
            supported,
            output_gain: db_to_linear(out_gain_db),
            input_gain: db_to_linear(in_gain_db),
        };

        let q = default_q();
        let fs = self.sample_rate;

        // Recompute coefficients once per config change (transcendental math only here, not per sample)
        self.out_hp_coeffs = if hp_enabled {
            highpass_coeffs(hp_hz, fs, q)
        } else {
            BiquadCoeffs::IDENTITY
        };
        self.out_lp_coeffs = if lp_enabled {
            lowpass_coeffs(lp_hz, fs, q)
        } else {
            BiquadCoeffs::IDENTITY
        };
        // Input chain uses the same HP/LP settings
        self.in_hp_coeffs = self.out_hp_coeffs;
        self.in_lp_coeffs = self.out_lp_coeffs;
        // Note: filter states are NOT reset here — avoid a hard click on parameter change.
        // The filter settles naturally into the new coefficients.
    }

    /// Process a mono render sample (test tone).
    /// Returns the processed sample; early-returns x unchanged when DSP is bypassed.
    #[inline]
    pub fn process_render_mono(&mut self, x: f32) -> f32 {
        if !self.snapshot.enabled || !self.snapshot.supported {
            return x;
        }
        let y = x * self.snapshot.output_gain;
        let hp = self.out_hp_coeffs;
        let lp = self.out_lp_coeffs;
        let y = self.out_hp.process(y, &hp);
        self.out_lp.process(y, &lp)
    }

    /// Process one capture sample for the given channel index.
    /// Returns the processed sample; early-returns x unchanged when DSP is bypassed.
    #[inline]
    pub fn process_capture_sample(&mut self, x: f32, channel_index: usize) -> f32 {
        if !self.snapshot.enabled || !self.snapshot.supported {
            return x;
        }
        let ch_count = self.in_hp_states.len();
        if ch_count == 0 {
            return x;
        }
        let ci = channel_index % ch_count;
        let y = x * self.snapshot.input_gain;
        let hp = self.in_hp_coeffs;
        let lp = self.in_lp_coeffs;
        let y = self.in_hp_states[ci].process(y, &hp);
        self.in_lp_states[ci].process(y, &lp)
    }
}
