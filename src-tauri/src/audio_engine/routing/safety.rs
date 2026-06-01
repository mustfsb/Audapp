use crate::audio_engine::format::find_device_format;
use crate::audio_engine::routing::types::RoutingConfigInput;

pub struct SafetyCheckResult {
    pub ok: bool,
    pub error: Option<String>,
    pub warning: Option<String>,
    pub capture_sample_rate: Option<u32>,
    pub render_sample_rate: Option<u32>,
    pub capture_channels: Option<u16>,
    pub render_channels: Option<u16>,
    pub capture_is_float: bool,
    pub render_is_float: bool,
    pub capture_bits: u16,
    pub render_bits: u16,
}

const VIRTUAL_CABLE_HINT: &str = "Use a virtual cable (VB-CABLE, Voicemeeter, etc.) to send app audio into a capture device, then select that device here. Routing setup is manual.";

pub fn run_safety_checks(input: &RoutingConfigInput) -> SafetyCheckResult {
    if input.capture_device_id == input.render_device_id {
        return SafetyCheckResult {
            ok: false,
            error: Some(
                "Capture and output device must be different to avoid feedback.".to_string(),
            ),
            warning: None,
            capture_sample_rate: None,
            render_sample_rate: None,
            capture_channels: None,
            render_channels: None,
            capture_is_float: false,
            render_is_float: false,
            capture_bits: 0,
            render_bits: 0,
        };
    }

    let Some(capture) = find_device_format(&input.capture_device_id) else {
        return fail_unknown_device("capture");
    };
    let Some(render) = find_device_format(&input.render_device_id) else {
        return fail_unknown_device("output");
    };

    if capture.kind != "input" {
        return fail_invalid_kind("capture", "input");
    }
    if render.kind != "output" {
        return fail_invalid_kind("output", "output");
    }

    let cap_rate = capture.sample_rate.unwrap_or(0);
    let out_rate = render.sample_rate.unwrap_or(0);
    let cap_ch = capture.channels.unwrap_or(0);
    let out_ch = render.channels.unwrap_or(0);
    let cap_bits = capture.bits_per_sample.unwrap_or(0);
    let out_bits = render.bits_per_sample.unwrap_or(0);

    if !format_supported(capture.is_float, cap_bits) {
        return fail_unsupported_format("capture");
    }
    if !format_supported(render.is_float, out_bits) {
        return fail_unsupported_format("output");
    }

    if cap_rate == 0 || out_rate == 0 {
        return SafetyCheckResult {
            ok: false,
            error: Some("Could not read device sample rate.".to_string()),
            warning: None,
            capture_sample_rate: capture.sample_rate,
            render_sample_rate: render.sample_rate,
            capture_channels: capture.channels,
            render_channels: render.channels,
            capture_is_float: capture.is_float,
            render_is_float: render.is_float,
            capture_bits: cap_bits,
            render_bits: out_bits,
        };
    }

    if cap_rate != out_rate {
        return SafetyCheckResult {
            ok: false,
            error: Some(
                "Set both devices to the same sample rate, for example 48 kHz.".to_string(),
            ),
            warning: None,
            capture_sample_rate: Some(cap_rate),
            render_sample_rate: Some(out_rate),
            capture_channels: Some(cap_ch),
            render_channels: Some(out_ch),
            capture_is_float: capture.is_float,
            render_is_float: render.is_float,
            capture_bits: cap_bits,
            render_bits: out_bits,
        };
    }

    let mut warning = Some(VIRTUAL_CABLE_HINT.to_string());

    if cap_ch != out_ch {
        let ch_note = channel_mismatch_note(cap_ch, out_ch);
        warning = Some(format!("{VIRTUAL_CABLE_HINT} {ch_note}"));
    }

    SafetyCheckResult {
        ok: true,
        error: None,
        warning,
        capture_sample_rate: Some(cap_rate),
        render_sample_rate: Some(out_rate),
        capture_channels: Some(cap_ch),
        render_channels: Some(out_ch),
        capture_is_float: capture.is_float,
        render_is_float: render.is_float,
        capture_bits: cap_bits,
        render_bits: out_bits,
    }
}

fn format_supported(is_float: bool, bits: u16) -> bool {
    is_float || bits == 16
}

fn channel_mismatch_note(in_ch: u16, out_ch: u16) -> String {
    if in_ch == 1 && out_ch >= 2 {
        "Mono input will be duplicated to stereo output.".to_string()
    } else if in_ch >= 2 && out_ch == 1 {
        "Stereo input will be averaged to mono output.".to_string()
    } else {
        format!(
            "Channel count differs ({in_ch} in, {out_ch} out); first {} channels will be mapped.",
            in_ch.min(out_ch)
        )
    }
}

fn fail_unknown_device(role: &str) -> SafetyCheckResult {
    SafetyCheckResult {
        ok: false,
        error: Some(format!("Unknown {role} device. Refresh devices and try again.")),
        warning: None,
        capture_sample_rate: None,
        render_sample_rate: None,
        capture_channels: None,
        render_channels: None,
        capture_is_float: false,
        render_is_float: false,
        capture_bits: 0,
        render_bits: 0,
    }
}

fn fail_invalid_kind(role: &str, expected: &str) -> SafetyCheckResult {
    SafetyCheckResult {
        ok: false,
        error: Some(format!("Selected {role} device is not a valid {expected} endpoint.")),
        warning: None,
        capture_sample_rate: None,
        render_sample_rate: None,
        capture_channels: None,
        render_channels: None,
        capture_is_float: false,
        render_is_float: false,
        capture_bits: 0,
        render_bits: 0,
    }
}

fn fail_unsupported_format(role: &str) -> SafetyCheckResult {
    SafetyCheckResult {
        ok: false,
        error: Some(format!(
            "Unsupported {role} format. Only 32-bit float and 16-bit PCM are supported."
        )),
        warning: None,
        capture_sample_rate: None,
        render_sample_rate: None,
        capture_channels: None,
        render_channels: None,
        capture_is_float: false,
        render_is_float: false,
        capture_bits: 0,
        render_bits: 0,
    }
}

/// Map input channel index to source channel for one output frame.
pub fn map_input_channel(out_ch: usize, in_channels: usize, out_channels: usize) -> usize {
    if in_channels == 0 || out_channels == 0 {
        return 0;
    }
    if in_channels == out_channels {
        return out_ch.min(in_channels - 1);
    }
    if in_channels == 1 {
        return 0;
    }
    if out_channels == 1 {
        return out_ch.min(in_channels - 1);
    }
    out_ch.min(in_channels - 1)
}

/// Mix down or up one frame of interleaved input into one output sample for `out_ch`.
pub fn sample_for_output_channel(
    frame: &[f32],
    in_channels: usize,
    out_ch: usize,
    out_channels: usize,
) -> f32 {
    if in_channels == 0 {
        return 0.0;
    }
    if in_channels == out_channels {
        let idx = out_ch.min(in_channels - 1);
        return frame[idx];
    }
    if in_channels == 1 {
        return frame[0];
    }
    if out_channels == 1 && in_channels >= 2 {
        return (frame[0] + frame[1]) * 0.5;
    }
    let idx = map_input_channel(out_ch, in_channels, out_channels);
    frame[idx.min(frame.len().saturating_sub(1))]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_same_device() {
        let input = RoutingConfigInput {
            capture_device_id: "same".to_string(),
            render_device_id: "same".to_string(),
            requested_buffer_ms: None,
        };
        let r = run_safety_checks(&input);
        assert!(!r.ok);
        assert!(r.error.unwrap().contains("feedback"));
    }

    #[test]
    fn mono_to_stereo_duplicates() {
        let s = sample_for_output_channel(&[0.5], 1, 1, 2);
        assert!((s - 0.5).abs() < 1e-6);
    }

    #[test]
    fn stereo_to_mono_averages() {
        let s = sample_for_output_channel(&[1.0, -1.0], 2, 0, 1);
        assert!(s.abs() < 1e-6);
    }
}
