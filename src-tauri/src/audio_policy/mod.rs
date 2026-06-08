mod default_endpoint;
mod manager;
mod preferences;
mod types;

pub use manager::{
    clear_output_preference, get_output_preferences_status, init_output_preferences,
    routing_auto_start, routing_disable, routing_enable, routing_get_status, routing_shutdown,
    set_output_preference,
};
pub use types::{OutputPreferencesStatus, RoutingStatus, SavedOutputDevicePreference};
