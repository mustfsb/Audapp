use std::f32::consts::PI;

pub struct ToneGenerator {
    phase: f32,
    frequency: f32,
    gain: f32,
    sample_rate: u32,
}

impl ToneGenerator {
    pub fn new(frequency: f32, gain: f32, sample_rate: u32) -> Self {
        Self {
            phase: 0.0,
            frequency,
            gain,
            sample_rate,
        }
    }

    #[inline]
    pub fn next_sample(&mut self) -> f32 {
        let sample = (self.phase * 2.0 * PI).sin() * self.gain;
        self.phase += self.frequency / self.sample_rate as f32;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        sample
    }
}
