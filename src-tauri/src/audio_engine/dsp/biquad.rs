/// Normalized biquad coefficients (a0 = 1.0 assumed).
#[derive(Debug, Clone, Copy)]
pub struct BiquadCoeffs {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
}

impl BiquadCoeffs {
    pub const IDENTITY: Self = Self {
        b0: 1.0,
        b1: 0.0,
        b2: 0.0,
        a1: 0.0,
        a2: 0.0,
    };
}

impl Default for BiquadCoeffs {
    fn default() -> Self {
        Self::IDENTITY
    }
}

/// Per-instance state for Direct Form II Transposed.
#[derive(Debug, Clone, Copy, Default)]
pub struct BiquadState {
    z1: f32,
    z2: f32,
}

impl BiquadState {
    /// Process one sample using Direct Form II Transposed:
    ///   y  = b0*x + z1
    ///   z1 = b1*x - a1*y + z2
    ///   z2 = b2*x - a2*y
    #[inline]
    pub fn process(&mut self, x: f32, c: &BiquadCoeffs) -> f32 {
        let y = c.b0 * x + self.z1;
        self.z1 = c.b1 * x - c.a1 * y + self.z2;
        self.z2 = c.b2 * x - c.a2 * y;
        // Flush denormals to avoid CPU slowdowns when filter settles to silence
        if self.z1.abs() < 1.0e-30 {
            self.z1 = 0.0;
        }
        if self.z2.abs() < 1.0e-30 {
            self.z2 = 0.0;
        }
        y
    }

    pub fn reset(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_passthrough() {
        let c = BiquadCoeffs::IDENTITY;
        let mut s = BiquadState::default();
        for x in [1.0_f32, 0.5, -0.5, 0.25, -0.1] {
            let y = s.process(x, &c);
            assert!((y - x).abs() < 1e-5, "Identity should pass {x} through, got {y}");
        }
    }

    #[test]
    fn silence_remains_silence() {
        let c = BiquadCoeffs::IDENTITY;
        let mut s = BiquadState::default();
        for _ in 0..100 {
            let y = s.process(0.0, &c);
            assert!(y.abs() < 1e-5, "Silence in should give silence out, got {y}");
        }
    }

    #[test]
    fn state_reset() {
        let c = BiquadCoeffs::IDENTITY;
        let mut s = BiquadState::default();
        s.process(1.0, &c);
        s.reset();
        assert_eq!(s.z1, 0.0);
        assert_eq!(s.z2, 0.0);
    }
}
