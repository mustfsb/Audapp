/// Soft-clip limiter for the render output stage.
///
/// Uses a cubic soft knee above 0.9 to tame signals before hard-clamping at ±1.0.
/// This prevents harsh digital clipping when gain + EQ boosts exceed full scale.
///
/// Stateless, allocation-free; safe to call from the audio hot path.
#[inline]
pub fn soft_limit(x: f32) -> f32 {
    let abs = x.abs();
    if abs <= 0.9 {
        // Pass through unchanged below the knee
        x
    } else if abs < 1.0 {
        // Cubic soft knee: smoothly approaches ±1.0
        let sign = x.signum();
        let t = (abs - 0.9) / 0.1; // 0..1 in the knee region
        let shaped = 0.9 + 0.1 * (t * (2.0 - t)); // ease-in curve: starts steep, flattens at 1.0
        sign * shaped
    } else {
        // Hard ceiling
        x.signum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn below_knee_passes_through() {
        for x in [-0.9_f32, -0.5, -0.1, 0.0, 0.1, 0.5, 0.9] {
            let y = soft_limit(x);
            assert!(
                (y - x).abs() < 1e-6,
                "Expected {x} to pass through unchanged, got {y}"
            );
        }
    }

    #[test]
    fn large_positive_clamped_to_one() {
        let y = soft_limit(5.0);
        assert!(y <= 1.0, "Expected |y| <= 1.0 for input 5.0, got {y}");
        assert!(y > 0.0, "Expected y > 0 for positive input, got {y}");
    }

    #[test]
    fn large_negative_clamped_to_minus_one() {
        let y = soft_limit(-5.0);
        assert!(y >= -1.0, "Expected y >= -1.0 for input -5.0, got {y}");
        assert!(y < 0.0, "Expected y < 0 for negative input, got {y}");
    }

    #[test]
    fn zero_maps_to_zero() {
        assert_eq!(soft_limit(0.0), 0.0);
    }

    #[test]
    fn output_always_finite() {
        for x in [0.0_f32, 0.9, 1.0, 1.5, 5.0, -5.0, f32::MAX, -f32::MAX] {
            let y = soft_limit(x);
            assert!(y.is_finite(), "Output must be finite for input {x}, got {y}");
        }
    }

    #[test]
    fn ceiling_exactly_one() {
        // At and above 1.0 the hard ceiling kicks in
        let y = soft_limit(1.0);
        assert!((y - 1.0).abs() < 1e-6, "soft_limit(1.0) should be 1.0, got {y}");
        let y = soft_limit(100.0);
        assert!((y - 1.0).abs() < 1e-6, "soft_limit(100.0) should be 1.0, got {y}");
        let y = soft_limit(-100.0);
        assert!((y + 1.0).abs() < 1e-6, "soft_limit(-100.0) should be -1.0, got {y}");
    }

    #[test]
    fn knee_is_monotonic() {
        // Values in the knee region should increase monotonically
        let samples: Vec<f32> = (0..=20).map(|i| 0.9 + i as f32 * 0.005).collect();
        let mut prev = soft_limit(samples[0]);
        for &x in &samples[1..] {
            let y = soft_limit(x);
            assert!(y >= prev, "Limiter should be monotonic: y({x})={y} < prev={prev}");
            prev = y;
        }
    }
}
