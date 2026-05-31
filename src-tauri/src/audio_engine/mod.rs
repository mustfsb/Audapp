pub mod dsp;
mod errors;
mod format;
mod manager;
mod metrics;
mod tone;
mod types;
mod wasapi;

pub use dsp::{get_config as dsp_get_config, get_status as dsp_get_status, reset_config as dsp_reset_config, set_config as dsp_set_config, set_eq_preset as dsp_set_eq_preset, DspRuntimeConfig, DspRuntimeStatus};
pub use format::probe_device_formats;
pub use manager::{engine_shutdown, engine_start, engine_status, engine_stop};
pub use types::{AudioEngineRuntimeStatus, DeviceFormatInfo, StartAudioEngineTestInput};

pub fn dsp_load_and_apply_persisted(data_dir: &std::path::Path) {
    let config = dsp::persistence::load_dsp_config(data_dir);
    let _ = dsp::set_config(config);
}
