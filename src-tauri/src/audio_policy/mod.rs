mod default_endpoint;
mod manager;
mod types;

pub use manager::{
    routing_auto_start, routing_disable, routing_enable, routing_get_status, routing_shutdown,
};
pub use types::RoutingStatus;
