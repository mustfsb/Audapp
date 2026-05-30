pub fn estimated_latency_ms(buffer_frames: u32, sample_rate: u32) -> f64 {
    if sample_rate == 0 {
        return 0.0;
    }
    buffer_frames as f64 / sample_rate as f64 * 1000.0
}
