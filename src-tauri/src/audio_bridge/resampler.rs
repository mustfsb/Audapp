/// Linear interpolation resampler for interleaved f32 PCM audio.
///
/// Maintains fractional phase across calls so block boundaries are seamless.
/// Designed for the common 44100 ↔ 48000 Hz conversion; works for any ratio.
pub struct LinearResampler {
    channels: usize,
    ratio: f64,     // in_rate / out_rate
    phase: f64,     // carry-over: offset from end of last input block
    last: Vec<f32>, // last input frame from previous call (for boundary interpolation)
}

impl LinearResampler {
    /// `in_rate` / `out_rate` must both be > 0.
    pub fn new(in_rate: u32, out_rate: u32, channels: usize) -> Self {
        let channels = channels.max(1);
        Self {
            channels,
            ratio: in_rate as f64 / out_rate.max(1) as f64,
            phase: 0.0,
            last: vec![0.0f32; channels],
        }
    }

    pub fn ratio(&self) -> f64 {
        self.ratio
    }

    /// Resample interleaved `input` frames (channel-interleaved f32) to output rate.
    ///
    /// Returns interleaved f32 output frames at the target rate.
    /// Output length = approximately `input_frames * (out_rate / in_rate)`.
    ///
    /// Clamps output to [-1.0, 1.0] to suppress any floating-point creep.
    pub fn resample(&mut self, input: &[f32]) -> Vec<f32> {
        let ch = self.channels;
        let in_frames = input.len() / ch;
        if in_frames == 0 {
            return Vec::new();
        }

        // Upper bound: ceil((in_frames / ratio) + 2) to avoid reallocations
        let est_out = (in_frames as f64 / self.ratio + 2.0) as usize;
        let mut out = Vec::with_capacity(est_out * ch);

        // t: fractional position in current input block (0.0 = input[0]).
        // After the previous call, phase is the offset past that call's last frame;
        // negative means we start before input[0] and interpolate with self.last.
        let mut t = self.phase;

        loop {
            let i0 = t.floor() as i64;
            let i1 = i0 + 1;

            // Need i1 to be a valid input frame
            if i1 >= in_frames as i64 {
                break;
            }

            let frac = (t - t.floor()) as f32;

            for c in 0..ch {
                let s0 = if i0 < 0 {
                    self.last[c]
                } else {
                    input[i0 as usize * ch + c]
                };
                let s1 = input[i1 as usize * ch + c];
                out.push((s0 + frac * (s1 - s0)).clamp(-1.0, 1.0));
            }

            t += self.ratio;
        }

        // Save last input frame for next call's boundary interpolation
        let last_start = (in_frames - 1) * ch;
        self.last
            .copy_from_slice(&input[last_start..last_start + ch]);

        // Carry phase: how far past the last input frame the next output starts.
        // Negative means "before new input[0]" — handled by the i0 < 0 branch above.
        self.phase = t - in_frames as f64;

        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passthrough_same_rate() {
        let mut rs = LinearResampler::new(48000, 48000, 2);
        let input: Vec<f32> = (0..8).map(|i| i as f32 * 0.1).collect();
        let out = rs.resample(&input);
        // 4 frames in → 4 frames out (minus last which is boundary)
        assert_eq!(out.len() / 2, 3); // i1 < 4, so last usable i1=3
    }

    #[test]
    fn upsample_ratio_less_than_one() {
        // 44100 → 48000: ratio = 0.91875, more output frames than input
        let mut rs = LinearResampler::new(44100, 48000, 1);
        let input: Vec<f32> = vec![0.0, 0.5, 1.0, 0.5, 0.0];
        let out = rs.resample(&input);
        // Should produce ~5 * (48000/44100) ≈ 5.44 → 5 output frames
        assert!(
            out.len() >= 4,
            "expected at least 4 output frames, got {}",
            out.len()
        );
        for &v in &out {
            assert!(v >= -1.0 && v <= 1.0, "sample out of range: {v}");
        }
    }

    #[test]
    fn phase_continuity_across_blocks() {
        let mut rs = LinearResampler::new(44100, 48000, 1);
        // Process same data in two halves; combined output should match single-block output
        let data: Vec<f32> = (0..100).map(|i| (i as f32) / 100.0).collect();
        let out_single = {
            let mut rs2 = LinearResampler::new(44100, 48000, 1);
            rs2.resample(&data)
        };
        let half = data.len() / 2;
        let out1 = rs.resample(&data[..half]);
        let out2 = rs.resample(&data[half..]);
        let out_two: Vec<f32> = out1.into_iter().chain(out2).collect();
        // Two-block output should be close in length to single-block output
        assert!((out_two.len() as i64 - out_single.len() as i64).abs() <= 2);
    }
}
