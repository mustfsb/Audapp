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
        .find(|device| {
            device.kind == "output"
                && device.state == "active"
                && device.id == device_id
                && !device.is_audapp_endpoint
        })
        .map(|device| RenderEndpointInfo {
            id: device.id.clone(),
            name: device.name.clone(),
            is_default: device.is_default,
        })
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
}
