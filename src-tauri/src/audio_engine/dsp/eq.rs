use std::f32::consts::PI;

use super::biquad::BiquadCoeffs;
use super::filters::clamp_cutoff;

pub const NUM_EQ_BANDS: usize = 5;
pub const EQ_FREQUENCIES: [f32; NUM_EQ_BANDS] = [100.0, 250.0, 1000.0, 4000.0, 10000.0];
pub const EQ_GAIN_MIN_DB: f32 = -12.0;
pub const EQ_GAIN_MAX_DB: f32 = 12.0;
pub const EQ_Q: f32 = 1.0;

#[inline]
pub fn clamp_eq_gain_db(db: f32) -> f32 {
    db.clamp(EQ_GAIN_MIN_DB, EQ_GAIN_MAX_DB)
}

/// RBJ-cookbook peaking EQ coefficients.
/// Returns BiquadCoeffs::IDENTITY when |gain_db| < 0.01 (transparent band shortcut).
pub fn peaking_eq_coeffs(fc: f32, fs: f32, gain_db: f32, q: f32) -> BiquadCoeffs {
    if gain_db.abs() < 0.01 {
        return BiquadCoeffs::IDENTITY;
    }
    let fc = clamp_cutoff(fc, fs);
    let q = q.max(0.1);
    let a = 10.0_f32.powf(gain_db / 40.0); // sqrt(10^(gain_db/20))
    let w0 = 2.0 * PI * fc / fs;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * q);

    let b0 = 1.0 + alpha * a;
    let b1 = -2.0 * cos_w0;
    let b2 = 1.0 - alpha * a;
    let a0 = 1.0 + alpha / a;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha / a;

    BiquadCoeffs {
        b0: b0 / a0,
        b1: b1 / a0,
        b2: b2 / a0,
        a1: a1 / a0,
        a2: a2 / a0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FS: f32 = 48000.0;

    #[test]
    fn peaking_eq_coefficients_finite() {
        let boost = peaking_eq_coeffs(1000.0, FS, 6.0, EQ_Q);
        assert!(boost.b0.is_finite() && boost.b1.is_finite() && boost.b2.is_finite());
        assert!(boost.a1.is_finite() && boost.a2.is_finite());
        let cut = peaking_eq_coeffs(1000.0, FS, -6.0, EQ_Q);
        assert!(cut.b0.is_finite() && cut.a1.is_finite());
    }

    #[test]
    fn peaking_eq_dc_gain_near_unity() {
        // H(z=1) = (b0+b1+b2)/(1+a1+a2) should be ≈1.0 for peaking EQ at any gain
        for gain_db in [-12.0_f32, -6.0, 3.0, 6.0, 12.0] {
            let c = peaking_eq_coeffs(1000.0, FS, gain_db, EQ_Q);
            let dc = (c.b0 + c.b1 + c.b2) / (1.0 + c.a1 + c.a2);
            assert!(
                (dc - 1.0).abs() < 1e-3,
                "DC gain should be ~1.0 for gain_db={gain_db}, got {dc}"
            );
        }
    }

    #[test]
    fn peaking_eq_nyquist_gain_near_unity() {
        // H(z=-1) = (b0-b1+b2)/(1-a1+a2) should be ≈1.0
        for gain_db in [-12.0_f32, -6.0, 6.0, 12.0] {
            let c = peaking_eq_coeffs(1000.0, FS, gain_db, EQ_Q);
            let nyq = (c.b0 - c.b1 + c.b2) / (1.0 - c.a1 + c.a2);
            assert!(
                (nyq - 1.0).abs() < 1e-3,
                "Nyquist gain should be ~1.0 for gain_db={gain_db}, got {nyq}"
            );
        }
    }

    #[test]
    fn peaking_eq_zero_gain_returns_identity() {
        let c = peaking_eq_coeffs(1000.0, FS, 0.0, EQ_Q);
        assert_eq!(c.b0, BiquadCoeffs::IDENTITY.b0);
        assert_eq!(c.b1, BiquadCoeffs::IDENTITY.b1);
        assert_eq!(c.b2, BiquadCoeffs::IDENTITY.b2);
        assert_eq!(c.a1, BiquadCoeffs::IDENTITY.a1);
        assert_eq!(c.a2, BiquadCoeffs::IDENTITY.a2);
    }

    #[test]
    fn peaking_eq_no_panic_degenerate_fs() {
        let c = peaking_eq_coeffs(1000.0, 1.0, 6.0, 1.0);
        assert!(c.b0.is_finite());
    }

    #[test]
    fn clamp_eq_gain_db_clamps() {
        assert_eq!(clamp_eq_gain_db(100.0), EQ_GAIN_MAX_DB);
        assert_eq!(clamp_eq_gain_db(-100.0), EQ_GAIN_MIN_DB);
        assert_eq!(clamp_eq_gain_db(0.0), 0.0);
        assert_eq!(clamp_eq_gain_db(6.0), 6.0);
    }
}
