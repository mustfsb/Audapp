mod endpoints;
mod manager;
mod multichannel_manager;
mod multichannel_types;
mod multichannel_worker;
pub mod resampler;
mod runtime_config;
mod types;
mod worker;

pub use endpoints::{
    is_active_physical_output, is_audapp_endpoint_name, is_audapp_render_device,
    is_legacy_input_name, require_multichannel_endpoints, resolve_audapp_render_endpoints,
    resolve_physical_output_candidate, EndpointResolutionError, RenderEndpointInfo,
    ResolvedAudappRenderEndpoints,
};
pub use manager::{
    bridge_list_candidates, bridge_shutdown, bridge_start, bridge_status, bridge_stop,
};
pub use multichannel_manager::{
    multichannel_bridge_is_running, multichannel_bridge_list_candidates,
    multichannel_bridge_shutdown, multichannel_bridge_start, multichannel_bridge_status,
    multichannel_bridge_stop, preferred_non_audapp_output_id, resolve_multichannel_start,
    resolve_multichannel_start_from_devices, ResolvedMultichannelStart,
};
pub use multichannel_types::{
    ChannelBridgeCandidate, MultichannelBridgeCandidates, MultichannelBridgeConfig,
    MultichannelBridgeStatus, MultichannelOutputStatus, MultichannelSourceStatus,
};
pub use runtime_config::{
    channel_gain_linear, channel_is_muted, init_runtime_channel_config,
    reset_runtime_channel_config, runtime_channel_snapshot, runtime_channel_snapshots,
    update_runtime_channel_config, RuntimeChannelSnapshot,
};
pub use types::{BridgeCandidates, BridgePocConfig, BridgePocStatus, BridgeState};
