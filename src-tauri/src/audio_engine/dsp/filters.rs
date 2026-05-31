use std::f32::consts::PI;

use super::biquad::BiquadCoeffs;

// Butterworth maximally-flat Q
const BUTTERWORTH_Q: f32 = 0.7071068;

pub fn default_q() -> f32 {
    BUTTERWORTH_Q
}

/// RBJ-cookbook low-pass filter coefficients.
pub fn lowpass_coeffs(fc: f32, fs: f32, q: f32) -> BiquadCoeffs {
    let fc = clamp_cutoff(fc, fs);
    let q = q.max(0.1);
    let w0 = 2.0 * PI * fc / fs;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * q);

    let b0 = (1.0 - cos_w0) / 2.0;
    let b1 = 1.0 - cos_w0;
    let b2 = (1.0 - cos_w0) / 2.0;
    let a0 = 1.0 + alpha;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha;

    BiquadCoeffs {
        b0: b0 / a0,
        b1: b1 / a0,
        b2: b2 / a0,
        a1: a1 / a0,
        a2: a2 / a0,
    }
}

/// RBJ-cookbook high-pass filter coefficients.
pub fn highpass_coeffs(fc: f32, fs: f32, q: f32) -> BiquadCoeffs {
    let fc = clamp_cutoff(fc, fs);
    let q = q.max(0.1);
    let w0 = 2.0 * PI * fc / fs;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * q);

    let b0 = (1.0 + cos_w0) / 2.0;
    let b1 = -(1.0 + cos_w0);
    let b2 = (1.0 + cos_w0) / 2.0;
    let a0 = 1.0 + alpha;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha;

    BiquadCoeffs {
        b0: b0 / a0,
        b1: b1 / a0,
        b2: b2 / a0,
        a1: a1 / a0,
        a2: a2 / a0,
    }
}

/// Clamp cutoff to (1 Hz, Nyquist * 0.999), with a safe minimum for degenerate sample rates.
pub fn clamp_cutoff(fc: f32, fs: f32) -> f32 {
    let nyquist = (fs / 2.0).max(2.0); // Guard against fs <= 2 Hz
    let max_fc = (nyquist * 0.999).max(1.0);
    fc.clamp(1.0, max_fc)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FS: f32 = 48000.0;

    #[test]
    fn lpf_coefficients_finite() {
        let c = lowpass_coeffs(1000.0, FS, BUTTERWORTH_Q);
        assert!(c.b0.is_finite() && c.b1.is_finite() && c.b2.is_finite());
        assert!(c.a1.is_finite() && c.a2.is_finite());
    }

    #[test]
    fn hpf_coefficients_finite() {
        let c = highpass_coeffs(100.0, FS, BUTTERWORTH_Q);
        assert!(c.b0.is_finite() && c.b1.is_finite() && c.b2.is_finite());
        assert!(c.a1.is_finite() && c.a2.is_finite());
    }

    #[test]
    fn lpf_dc_gain_near_unity() {
        // H(z=1) = (b0+b1+b2) / (1+a1+a2)
        let c = lowpass_coeffs(1000.0, FS, BUTTERWORTH_Q);
        let dc = (c.b0 + c.b1 + c.b2) / (1.0 + c.a1 + c.a2);
        assert!((dc - 1.0).abs() < 1e-3, "LPF DC gain should be ~1.0, got {dc}");
    }

    #[test]
    fn hpf_dc_gain_near_zero() {
        // H(z=1) for HPF should be ~0
        let c = highpass_coeffs(100.0, FS, BUTTERWORTH_Q);
        let dc = (c.b0 + c.b1 + c.b2) / (1.0 + c.a1 + c.a2);
        assert!(dc.abs() < 0.01, "HPF DC gain should be ~0, got {dc}");
    }

    #[test]
    fn cutoff_clamped_below_nyquist() {
        let nyquist = FS / 2.0;
        let clamped = clamp_cutoff(nyquist + 1000.0, FS);
        assert!(clamped < nyquist, "Cutoff must be below Nyquist");
    }

    #[test]
    fn lpf_with_zero_sample_rate_does_not_panic() {
        // Should clamp gracefully even if sample rate is 1 (degenerate)
        let c = lowpass_coeffs(100.0, 1.0, BUTTERWORTH_Q);
        assert!(c.b0.is_finite());
    }
}
