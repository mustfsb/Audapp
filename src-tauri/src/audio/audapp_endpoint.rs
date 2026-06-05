//! Classification of Audapp audio endpoints by friendly name.
//!
//! Endpoint friendly names read from `PKEY_Device_FriendlyName` look like
//! `"Hoparlör (Audapp General)"` / `"Mikrofon (Audapp Input)"`. We classify on a
//! lowercased substring match so the logic does not depend on the localized
//! `Hoparlör`/`Mikrofon` prefix.

/// The role an Audapp endpoint plays in the app.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudappEndpointKind {
    /// Legacy Audapp Input bridge endpoint (render + capture).
    Input,
    /// One of the four AudappChannels output endpoints.
    ChannelOutput,
    /// Stale/legacy Audapp Multi endpoint (pre-21G architecture).
    LegacyMulti,
    /// Contains "audapp" but is not a recognized endpoint.
    Unknown,
}

impl AudappEndpointKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Input => "input",
            Self::ChannelOutput => "channel_output",
            Self::LegacyMulti => "legacy_multi",
            Self::Unknown => "unknown",
        }
    }
}

/// Result of classifying an endpoint friendly name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AudappEndpointClass {
    /// True when the name belongs to any Audapp endpoint.
    pub is_audapp_endpoint: bool,
    /// The endpoint role, or `None` for non-Audapp endpoints.
    pub kind: Option<AudappEndpointKind>,
    /// The internal output channel id, only set for channel outputs.
    pub channel_id: Option<&'static str>,
}

impl AudappEndpointClass {
    fn not_audapp() -> Self {
        Self {
            is_audapp_endpoint: false,
            kind: None,
            channel_id: None,
        }
    }
}

/// Ordered (needle, internal channel id) pairs for the four AudappChannels
/// output endpoints. None of the needles is a substring of another.
const CHANNEL_MATCHERS: &[(&str, &str)] = &[
    ("audapp general", "general"),
    ("audapp music", "music"),
    ("audapp game", "game"),
    ("audapp browser", "browser"),
];

/// Classify an endpoint by its friendly name.
pub fn classify_audapp_endpoint(name: &str) -> AudappEndpointClass {
    let lower = name.to_lowercase();

    for (needle, channel) in CHANNEL_MATCHERS {
        if lower.contains(needle) {
            return AudappEndpointClass {
                is_audapp_endpoint: true,
                kind: Some(AudappEndpointKind::ChannelOutput),
                channel_id: Some(channel),
            };
        }
    }

    if lower.contains("audapp input") {
        return AudappEndpointClass {
            is_audapp_endpoint: true,
            kind: Some(AudappEndpointKind::Input),
            channel_id: None,
        };
    }

    if lower.contains("audapp multi") {
        return AudappEndpointClass {
            is_audapp_endpoint: true,
            kind: Some(AudappEndpointKind::LegacyMulti),
            channel_id: None,
        };
    }

    if lower.contains("audapp") {
        return AudappEndpointClass {
            is_audapp_endpoint: true,
            kind: Some(AudappEndpointKind::Unknown),
            channel_id: None,
        };
    }

    AudappEndpointClass::not_audapp()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn classify(name: &str) -> AudappEndpointClass {
        classify_audapp_endpoint(name)
    }

    #[test]
    fn maps_the_four_channel_outputs_ignoring_locale_prefix() {
        let cases = [
            ("Hoparlör (Audapp General)", "general"),
            ("Hoparlör (Audapp Music)", "music"),
            ("Hoparlör (Audapp Game)", "game"),
            ("Hoparlör (Audapp Browser)", "browser"),
            // Locale-independent: same result without the prefix.
            ("Speakers (Audapp Browser)", "browser"),
        ];

        for (name, expected) in cases {
            let class = classify(name);
            assert!(class.is_audapp_endpoint, "{name} should be audapp");
            assert_eq!(class.kind, Some(AudappEndpointKind::ChannelOutput), "{name}");
            assert_eq!(class.channel_id, Some(expected), "{name}");
        }
    }

    #[test]
    fn classifies_audapp_input_render_and_capture() {
        for name in ["Hoparlör (Audapp Input)", "Mikrofon (Audapp Input)"] {
            let class = classify(name);
            assert!(class.is_audapp_endpoint);
            assert_eq!(class.kind, Some(AudappEndpointKind::Input));
            assert_eq!(class.channel_id, None);
        }
    }

    #[test]
    fn classifies_legacy_multi_as_stale() {
        let class = classify("Hoparlör (Audapp Multi)");
        assert!(class.is_audapp_endpoint);
        assert_eq!(class.kind, Some(AudappEndpointKind::LegacyMulti));
        assert_eq!(class.channel_id, None);
    }

    #[test]
    fn unknown_audapp_name_is_flagged_without_channel() {
        let class = classify("Audapp Mystery Endpoint");
        assert!(class.is_audapp_endpoint);
        assert_eq!(class.kind, Some(AudappEndpointKind::Unknown));
        assert_eq!(class.channel_id, None);
    }

    #[test]
    fn physical_device_is_not_audapp() {
        let class = classify("Hoparlör (High Definition Audio Device)");
        assert!(!class.is_audapp_endpoint);
        assert_eq!(class.kind, None);
        assert_eq!(class.channel_id, None);
    }

    #[test]
    fn kind_as_str_matches_contract() {
        assert_eq!(AudappEndpointKind::Input.as_str(), "input");
        assert_eq!(AudappEndpointKind::ChannelOutput.as_str(), "channel_output");
        assert_eq!(AudappEndpointKind::LegacyMulti.as_str(), "legacy_multi");
        assert_eq!(AudappEndpointKind::Unknown.as_str(), "unknown");
    }
}
