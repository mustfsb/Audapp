use crate::audio::{classify_audapp_endpoint, AudappEndpointKind};
use crate::audio::AudioDiscoveryDevice;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderEndpointInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ResolvedAudappRenderEndpoints {
    pub general: Option<RenderEndpointInfo>,
    pub music: Option<RenderEndpointInfo>,
    pub game: Option<RenderEndpointInfo>,
    pub browser: Option<RenderEndpointInfo>,
    pub legacy_input: Option<RenderEndpointInfo>,
}

impl ResolvedAudappRenderEndpoints {
    pub fn channel_count(&self) -> usize {
        [
            self.general.as_ref(),
            self.music.as_ref(),
            self.game.as_ref(),
            self.browser.as_ref(),
        ]
        .into_iter()
        .flatten()
        .count()
    }

    pub fn all_channels_present(&self) -> bool {
        self.channel_count() == 4
    }
}

pub fn resolve_audapp_render_endpoints(
    endpoints: &[RenderEndpointInfo],
) -> ResolvedAudappRenderEndpoints {
    let mut resolved = ResolvedAudappRenderEndpoints::default();

    for endpoint in endpoints {
        let class = classify_audapp_endpoint(&endpoint.name);
        match (class.kind, class.channel_id) {
            (Some(AudappEndpointKind::ChannelOutput), Some("general")) => {
                if resolved.general.is_none() {
                    resolved.general = Some(endpoint.clone());
                }
            }
            (Some(AudappEndpointKind::ChannelOutput), Some("music")) => {
                if resolved.music.is_none() {
                    resolved.music = Some(endpoint.clone());
                }
            }
            (Some(AudappEndpointKind::ChannelOutput), Some("game")) => {
                if resolved.game.is_none() {
                    resolved.game = Some(endpoint.clone());
                }
            }
            (Some(AudappEndpointKind::ChannelOutput), Some("browser")) => {
                if resolved.browser.is_none() {
                    resolved.browser = Some(endpoint.clone());
                }
            }
            (Some(AudappEndpointKind::Input), _) => {
                if resolved.legacy_input.is_none() {
                    resolved.legacy_input = Some(endpoint.clone());
                }
            }
            _ => {}
        }
    }

    resolved
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EndpointResolutionError {
    MissingChannel(&'static str),
}

pub fn require_multichannel_endpoints(
    resolved: &ResolvedAudappRenderEndpoints,
) -> Result<(), EndpointResolutionError> {
    if resolved.general.is_none() {
        return Err(EndpointResolutionError::MissingChannel("general"));
    }
    if resolved.music.is_none() {
        return Err(EndpointResolutionError::MissingChannel("music"));
    }
    if resolved.game.is_none() {
        return Err(EndpointResolutionError::MissingChannel("game"));
    }
    if resolved.browser.is_none() {
        return Err(EndpointResolutionError::MissingChannel("browser"));
    }

    Ok(())
}

pub fn is_audapp_endpoint_name(name: &str) -> bool {
    classify_audapp_endpoint(name).is_audapp_endpoint
}

pub fn is_legacy_input_name(name: &str) -> bool {
    classify_audapp_endpoint(name).kind == Some(AudappEndpointKind::Input)
}

pub fn resolve_audapp_render_endpoints_from_devices(
    devices: &[AudioDiscoveryDevice],
) -> ResolvedAudappRenderEndpoints {
    resolve_audapp_render_endpoints(&render_endpoint_infos_from_devices(devices))
}

pub fn render_endpoint_infos_from_devices(
    devices: &[AudioDiscoveryDevice],
) -> Vec<RenderEndpointInfo> {
    devices
        .iter()
        .filter(|device| device.kind == "output" && device.state == "active")
        .map(|device| RenderEndpointInfo {
            id: device.id.clone(),
            name: device.name.clone(),
            is_default: device.is_default,
        })
        .collect()
}

pub fn physical_output_endpoints_from_devices(
    devices: &[AudioDiscoveryDevice],
) -> Vec<RenderEndpointInfo> {
    render_endpoint_infos_from_devices(devices)
        .into_iter()
        .filter(|device| !is_audapp_endpoint_name(&device.name))
        .collect()
}

pub fn find_active_output_device_by_id(
    devices: &[AudioDiscoveryDevice],
    device_id: &str,
) -> Option<RenderEndpointInfo> {
    devices
        .iter()
        .find(|device| device.id == device_id && is_active_physical_output(device))
        .map(render_endpoint_info_from_device)
}

/// True when a discovery device is *any* Audapp render endpoint: the four channel
/// outputs, the legacy Audapp Input, a stale Audapp Multi, or anything else whose
/// friendly name contains "audapp". Checks BOTH the precomputed boolean and the
/// friendly name so a stale/missing boolean can never let an Audapp endpoint slip
/// through as a physical render output.
pub fn is_audapp_render_device(device: &AudioDiscoveryDevice) -> bool {
    device.is_audapp_endpoint || is_audapp_endpoint_name(&device.name)
}

/// True when a device is an active, non-Audapp physical render output — the only
/// kind of endpoint the multi-channel bridge is ever allowed to render to.
pub fn is_active_physical_output(device: &AudioDiscoveryDevice) -> bool {
    device.kind == "output" && device.state == "active" && !is_audapp_render_device(device)
}

fn render_endpoint_info_from_device(device: &AudioDiscoveryDevice) -> RenderEndpointInfo {
    RenderEndpointInfo {
        id: device.id.clone(),
        name: device.name.clone(),
        is_default: device.is_default,
    }
}

/// Resolve the physical (non-Audapp) render output the multi-channel bridge must
/// render its mixed audio to.
///
/// The bridge mix **must never** be rendered to an Audapp endpoint (Audapp Input
/// or any of the General/Music/Game/Browser channel outputs) — doing so produces
/// silence because those are virtual sinks. This resolver enforces that by only
/// ever returning an active, non-Audapp render endpoint.
///
/// Priority:
/// 1. saved selected physical output (if still active and non-Audapp)
/// 2. previous restore target (if still active and non-Audapp)
/// 3. current Windows default (only if active and non-Audapp)
/// 4. first active non-Audapp render endpoint
/// 5. fail closed with a clear error
pub fn resolve_physical_output_candidate(
    devices: &[AudioDiscoveryDevice],
    saved_selected_output_id: Option<&str>,
    previous_restore_target_id: Option<&str>,
    current_default_id: Option<&str>,
) -> Result<RenderEndpointInfo, String> {
    let find_physical = |id: &str| {
        devices
            .iter()
            .find(|device| device.id == id && is_active_physical_output(device))
    };

    for candidate in [
        saved_selected_output_id,
        previous_restore_target_id,
        current_default_id,
    ]
    .into_iter()
    .flatten()
    {
        if let Some(device) = find_physical(candidate) {
            return Ok(render_endpoint_info_from_device(device));
        }
    }

    if let Some(device) = devices.iter().find(|device| is_active_physical_output(device)) {
        return Ok(render_endpoint_info_from_device(device));
    }

    Err(
        "No active physical (non-Audapp) render output is available. Connect or enable a real \
         output device (speakers/headphones) in Windows Sound settings — the bridge cannot \
         render to an Audapp endpoint."
            .to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn endpoint(id: &str, name: &str) -> RenderEndpointInfo {
        RenderEndpointInfo {
            id: id.to_string(),
            name: name.to_string(),
            is_default: false,
        }
    }

    #[test]
    fn resolves_all_four_channels_regardless_of_enumeration_order() {
        let endpoints = vec![
            endpoint("browser-id", "Hoparlör (Audapp Browser)"),
            endpoint("physical-id", "Hoparlör (High Definition Audio Device)"),
            endpoint("game-id", "Hoparlör (Audapp Game)"),
            endpoint("input-id", "Hoparlör (Audapp Input)"),
            endpoint("general-id", "Hoparlör (Audapp General)"),
            endpoint("music-id", "Hoparlör (Audapp Music)"),
        ];

        let resolved = resolve_audapp_render_endpoints(&endpoints);

        assert_eq!(resolved.general.as_ref().map(|item| item.id.as_str()), Some("general-id"));
        assert_eq!(resolved.music.as_ref().map(|item| item.id.as_str()), Some("music-id"));
        assert_eq!(resolved.game.as_ref().map(|item| item.id.as_str()), Some("game-id"));
        assert_eq!(resolved.browser.as_ref().map(|item| item.id.as_str()), Some("browser-id"));
        assert_eq!(resolved.legacy_input.as_ref().map(|item| item.id.as_str()), Some("input-id"));
        assert!(resolved.all_channels_present());
    }

    #[test]
    fn browser_is_not_treated_as_legacy_input_when_it_is_first() {
        let endpoints = vec![
            endpoint("browser-id", "Hoparlör (Audapp Browser)"),
            endpoint("input-id", "Hoparlör (Audapp Input)"),
            endpoint("general-id", "Hoparlör (Audapp General)"),
            endpoint("music-id", "Hoparlör (Audapp Music)"),
            endpoint("game-id", "Hoparlör (Audapp Game)"),
        ];

        let resolved = resolve_audapp_render_endpoints(&endpoints);

        assert_eq!(resolved.legacy_input.as_ref().map(|item| item.id.as_str()), Some("input-id"));
    }

    #[test]
    fn require_multichannel_endpoints_reports_missing_channel() {
        let resolved = ResolvedAudappRenderEndpoints {
            general: Some(endpoint("general-id", "Hoparlör (Audapp General)")),
            music: Some(endpoint("music-id", "Hoparlör (Audapp Music)")),
            game: Some(endpoint("game-id", "Hoparlör (Audapp Game)")),
            browser: None,
            legacy_input: Some(endpoint("input-id", "Hoparlör (Audapp Input)")),
        };

        assert_eq!(
            require_multichannel_endpoints(&resolved),
            Err(EndpointResolutionError::MissingChannel("browser"))
        );
    }

    fn output(id: &str, name: &str, is_default: bool, audapp_kind: Option<&str>) -> AudioDiscoveryDevice {
        AudioDiscoveryDevice {
            id: id.to_string(),
            name: name.to_string(),
            kind: "output".to_string(),
            state: "active".to_string(),
            is_default,
            is_audapp_endpoint: audapp_kind.is_some(),
            audapp_endpoint_kind: audapp_kind.map(str::to_string),
            audapp_channel_id: None,
        }
    }

    /// Mirrors the live box: Windows default is Audapp Input, plus the four channel
    /// outputs, and a single physical High Definition Audio Device.
    fn live_like_devices() -> Vec<AudioDiscoveryDevice> {
        vec![
            output("browser-id", "Hoparlör (Audapp Browser)", false, Some("channel_output")),
            output("game-id", "Hoparlör (Audapp Game)", false, Some("channel_output")),
            output("general-id", "Hoparlör (Audapp General)", false, Some("channel_output")),
            output("input-id", "Hoparlör (Audapp Input)", true, Some("input")),
            output("music-id", "Hoparlör (Audapp Music)", false, Some("channel_output")),
            output("hda-id", "Hoparlör (High Definition Audio Device)", false, None),
        ]
    }

    #[test]
    fn physical_resolver_rejects_audapp_input_default_and_picks_high_definition_audio() {
        let resolved = resolve_physical_output_candidate(
            &live_like_devices(),
            None,
            None,
            Some("input-id"),
        )
        .expect("physical output");

        assert_eq!(resolved.id, "hda-id");
        assert_eq!(resolved.name, "Hoparlör (High Definition Audio Device)");
    }

    #[test]
    fn physical_resolver_rejects_every_audapp_endpoint_passed_as_saved_or_default() {
        for audapp_id in ["input-id", "general-id", "music-id", "game-id", "browser-id"] {
            // As a saved selection.
            let resolved =
                resolve_physical_output_candidate(&live_like_devices(), Some(audapp_id), None, None)
                    .expect("physical output");
            assert_eq!(resolved.id, "hda-id", "saved {audapp_id} must be rejected");

            // As the current Windows default.
            let resolved =
                resolve_physical_output_candidate(&live_like_devices(), None, None, Some(audapp_id))
                    .expect("physical output");
            assert_eq!(resolved.id, "hda-id", "default {audapp_id} must be rejected");
        }
    }

    #[test]
    fn physical_resolver_rejects_audapp_even_when_boolean_flag_is_stale() {
        // is_audapp_endpoint=false but the name still says Audapp Browser: the
        // name-based guard must still reject it.
        let mut devices = live_like_devices();
        devices.push(output("stale-id", "Hoparlör (Audapp Browser)", false, None));

        let resolved =
            resolve_physical_output_candidate(&devices, Some("stale-id"), None, None).expect("physical");

        assert_eq!(resolved.id, "hda-id");
    }

    #[test]
    fn physical_resolver_honors_priority_saved_then_previous_then_default() {
        let mut devices = live_like_devices();
        devices.push(output("usb-id", "Speakers (USB Audio Device)", false, None));
        devices.push(output("hdmi-id", "Monitor (HDMI Audio)", false, None));

        // Saved selection wins over everything.
        let resolved = resolve_physical_output_candidate(
            &devices,
            Some("usb-id"),
            Some("hdmi-id"),
            Some("hda-id"),
        )
        .expect("physical");
        assert_eq!(resolved.id, "usb-id");

        // No saved → previous restore target wins over current default.
        let resolved =
            resolve_physical_output_candidate(&devices, None, Some("hdmi-id"), Some("hda-id"))
                .expect("physical");
        assert_eq!(resolved.id, "hdmi-id");

        // No saved/previous → current default (when physical) is used.
        let resolved = resolve_physical_output_candidate(&devices, None, None, Some("hda-id"))
            .expect("physical");
        assert_eq!(resolved.id, "hda-id");
    }

    #[test]
    fn physical_resolver_skips_inactive_saved_output() {
        let mut devices = live_like_devices();
        devices.push(AudioDiscoveryDevice {
            id: "unplugged-id".to_string(),
            name: "Headphones (Realtek)".to_string(),
            kind: "output".to_string(),
            state: "unplugged".to_string(),
            is_default: false,
            is_audapp_endpoint: false,
            audapp_endpoint_kind: None,
            audapp_channel_id: None,
        });

        let resolved =
            resolve_physical_output_candidate(&devices, Some("unplugged-id"), None, Some("input-id"))
                .expect("physical");

        assert_eq!(resolved.id, "hda-id");
    }

    #[test]
    fn physical_resolver_fails_closed_when_only_audapp_endpoints_exist() {
        let devices: Vec<AudioDiscoveryDevice> = live_like_devices()
            .into_iter()
            .filter(|device| device.is_audapp_endpoint)
            .collect();

        let error = resolve_physical_output_candidate(&devices, None, None, Some("input-id"))
            .expect_err("must fail closed");

        assert!(error.contains("No active physical"), "{error}");
    }
}
