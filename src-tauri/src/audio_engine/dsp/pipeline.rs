use std::sync::atomic::Ordering;

use super::biquad::{BiquadCoeffs, BiquadState};
use super::config::DspConfigShared;
use super::eq::{peaking_eq_coeffs, EQ_FREQUENCIES, EQ_Q, NUM_EQ_BANDS};
use super::filters::{default_q, highpass_coeffs, lowpass_coeffs};
use super::gain::db_to_linear;

/// Snapshot of config values cached for a buffer cycle (read once per cycle, never per sample).
struct DspSnapshot {
    enabled: bool,
    supported: bool,
    output_gain: f32,
    input_gain: f32,
    eq_enabled: bool,
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
    out_eq_states: [BiquadState; NUM_EQ_BANDS],
    out_eq_coeffs: [BiquadCoeffs; NUM_EQ_BANDS],
    // Per-channel input chain (capture is multichannel interleaved)
    in_hp_states: Vec<BiquadState>,
    in_lp_states: Vec<BiquadState>,
    in_hp_coeffs: BiquadCoeffs,
    in_lp_coeffs: BiquadCoeffs,
    in_eq_states: Vec<[BiquadState; NUM_EQ_BANDS]>,
    in_eq_coeffs: [BiquadCoeffs; NUM_EQ_BANDS],
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
                eq_enabled: false,
            },
            out_hp: BiquadState::default(),
            out_lp: BiquadState::default(),
            out_hp_coeffs: BiquadCoeffs::IDENTITY,
            out_lp_coeffs: BiquadCoeffs::IDENTITY,
            out_eq_states: [BiquadState::default(); NUM_EQ_BANDS],
            out_eq_coeffs: [BiquadCoeffs::IDENTITY; NUM_EQ_BANDS],
            in_hp_states: Vec::new(),
            in_lp_states: Vec::new(),
            in_hp_coeffs: BiquadCoeffs::IDENTITY,
            in_lp_coeffs: BiquadCoeffs::IDENTITY,
            in_eq_states: Vec::new(),
            in_eq_coeffs: [BiquadCoeffs::IDENTITY; NUM_EQ_BANDS],
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
        self.in_eq_states = vec![[BiquadState::default(); NUM_EQ_BANDS]; channels.max(1)];

        let fmt_tag: u32 = if is_float { 1 } else if bits_per_sample == 16 { 2 } else { 3 };
        shared.sample_format_tag.store(fmt_tag, Ordering::Relaxed);
        shared.supported.store(is_float, Ordering::Relaxed);
        shared
            .unsupported_reason_idx
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
        let eq_enabled = shared.eq_enabled.load(Ordering::Relaxed);

        self.snapshot = DspSnapshot {
            enabled,
            supported,
            output_gain: db_to_linear(out_gain_db),
            input_gain: db_to_linear(in_gain_db),
            eq_enabled,
        };

        let q = default_q();
        let fs = self.sample_rate;

        // Recompute HP/LP coefficients once per config change
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
        self.in_hp_coeffs = self.out_hp_coeffs;
        self.in_lp_coeffs = self.out_lp_coeffs;

        // Recompute EQ band coefficients once per config change
        for i in 0..NUM_EQ_BANDS {
            let gain_db = f32::from_bits(shared.eq_band_gains[i].load(Ordering::Relaxed));
            let band_enabled = shared.eq_band_enabled[i].load(Ordering::Relaxed);
            self.out_eq_coeffs[i] = if band_enabled && gain_db.abs() > 0.01 {
                peaking_eq_coeffs(EQ_FREQUENCIES[i], fs, gain_db, EQ_Q)
            } else {
                BiquadCoeffs::IDENTITY
            };
        }
        self.in_eq_coeffs = self.out_eq_coeffs;
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
        let mut y = self.out_hp.process(y, &hp);
        if self.snapshot.eq_enabled {
            for i in 0..NUM_EQ_BANDS {
                let c = self.out_eq_coeffs[i];
                y = self.out_eq_states[i].process(y, &c);
            }
        }
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
        let mut y = self.in_hp_states[ci].process(y, &hp);
        if self.snapshot.eq_enabled {
            for i in 0..NUM_EQ_BANDS {
                let c = self.in_eq_coeffs[i];
                y = self.in_eq_states[ci][i].process(y, &c);
            }
        }
        self.in_lp_states[ci].process(y, &lp)
    }
}
