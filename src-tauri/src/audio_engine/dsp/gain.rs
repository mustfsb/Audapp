pub const GAIN_DB_MIN: f32 = -24.0;
pub const GAIN_DB_MAX: f32 = 12.0;

#[inline]
pub fn db_to_linear(db: f32) -> f32 {
    10.0_f32.powf(db / 20.0)
}

#[inline]
pub fn linear_to_db(linear: f32) -> f32 {
    if linear <= 0.0 {
        f32::NEG_INFINITY
    } else {
        20.0 * linear.log10()
    }
}

#[inline]
pub fn clamp_gain_db(db: f32) -> f32 {
    db.clamp(GAIN_DB_MIN, GAIN_DB_MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_db_is_unity() {
        let lin = db_to_linear(0.0);
        assert!((lin - 1.0).abs() < 1e-5, "0 dB should be ~1.0, got {lin}");
    }

    #[test]
    fn negative_db_reduces() {
        let lin = db_to_linear(-6.0);
        assert!(lin < 1.0, "Negative dB should reduce gain");
        assert!(lin > 0.0, "Gain should stay positive");
    }

    #[test]
    fn positive_db_increases() {
        let lin = db_to_linear(6.0);
        assert!(lin > 1.0, "Positive dB should increase gain");
    }

    #[test]
    fn clamp_behavior() {
        assert_eq!(clamp_gain_db(-30.0), GAIN_DB_MIN);
        assert_eq!(clamp_gain_db(20.0), GAIN_DB_MAX);
        assert_eq!(clamp_gain_db(0.0), 0.0);
    }
}
