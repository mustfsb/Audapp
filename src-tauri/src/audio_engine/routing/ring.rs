/// Preallocated interleaved f32 ring buffer (single-threaded duplex worker).
pub struct F32Ring {
    buf: Vec<f32>,
    capacity: usize,
    read: usize,
    write: usize,
    len: usize,
    underruns: u64,
    overruns: u64,
}

impl F32Ring {
    pub fn with_capacity_ms(sample_rate: u32, channels: usize, cushion_ms: u32) -> Self {
        let frames = (sample_rate as u64 * cushion_ms as u64 / 1000).max(1) as usize;
        let capacity = frames * channels.max(1);
        Self {
            buf: vec![0.0; capacity],
            capacity,
            read: 0,
            write: 0,
            len: 0,
            underruns: 0,
            overruns: 0,
        }
    }

    pub fn push_interleaved(&mut self, samples: &[f32]) {
        for &s in samples {
            if self.len >= self.capacity {
                self.overruns += 1;
                self.read = (self.read + 1) % self.capacity;
                self.len -= 1;
            }
            self.buf[self.write] = s;
            self.write = (self.write + 1) % self.capacity;
            self.len += 1;
        }
    }

    pub fn pop_interleaved(&mut self, out: &mut [f32]) {
        for sample in out.iter_mut() {
            if self.len == 0 {
                *sample = 0.0;
                self.underruns += 1;
            } else {
                *sample = self.buf[self.read];
                self.read = (self.read + 1) % self.capacity;
                self.len -= 1;
            }
        }
    }

    pub fn fill_percent(&self) -> f32 {
        if self.capacity == 0 {
            0.0
        } else {
            (self.len as f32 / self.capacity as f32) * 100.0
        }
    }

    pub fn underrun_count(&self) -> u64 {
        self.underruns
    }

    pub fn overrun_count(&self) -> u64 {
        self.overruns
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_pop_roundtrip() {
        let mut ring = F32Ring::with_capacity_ms(48000, 2, 50);
        ring.push_interleaved(&[0.5, -0.5, 1.0, -1.0]);
        let mut out = [0.0f32; 4];
        ring.pop_interleaved(&mut out);
        assert!((out[0] - 0.5).abs() < 1e-6);
        assert!((out[3] + 1.0).abs() < 1e-6);
    }

    #[test]
    fn underrun_returns_silence() {
        let mut ring = F32Ring::with_capacity_ms(48000, 1, 10);
        let mut out = [1.0f32; 2];
        ring.pop_interleaved(&mut out);
        assert_eq!(out, [0.0, 0.0]);
        assert_eq!(ring.underrun_count(), 2);
    }

    #[test]
    fn overrun_drops_oldest() {
        let mut ring = F32Ring::with_capacity_ms(48000, 1, 1);
        let cap = 48; // 1 ms @ 48 kHz mono
        for i in 0..(cap + 10) {
            ring.push_interleaved(&[i as f32]);
        }
        assert!(ring.overrun_count() > 0);
    }
}
