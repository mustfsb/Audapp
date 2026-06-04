use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionRouteCapability {
    pub per_app_switching_supported: bool,
    pub support_scope: String,
    pub status_reason: String,
    pub manual_fallback: String,
    pub inspected_storage: Option<String>,
}

pub fn get_session_route_capability() -> SessionRouteCapability {
    SessionRouteCapability {
        per_app_switching_supported: false,
        support_scope: "unsupported".to_string(),
        status_reason:
            "Windows per-app output switching is not available through the current safe API path yet."
                .to_string(),
        manual_fallback:
            "Windows Settings -> Sound -> Volume mixer -> choose app output device"
                .to_string(),
        inspected_storage: Some(
            "HKCU\\Software\\Microsoft\\Internet Explorer\\LowRegistry\\Audio\\PolicyConfig\\PropertyStore"
                .to_string(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phase_19b_capability_is_honestly_unsupported() {
        let capability = get_session_route_capability();

        assert!(!capability.per_app_switching_supported);
        assert_eq!(capability.support_scope, "unsupported");
        assert!(capability.status_reason.contains("safe API path"));
        assert!(capability.manual_fallback.contains("Volume mixer"));
        assert!(capability
            .inspected_storage
            .as_deref()
            .unwrap_or_default()
            .contains("PolicyConfig\\PropertyStore"));
    }
}
