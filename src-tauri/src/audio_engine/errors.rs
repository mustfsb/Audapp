#[derive(Debug, Clone)]
pub enum EngineError {
    Platform(String),
    Windows(String),
    AlreadyRunning,
    InvalidInput(String),
    StreamFailed(String),
}

impl EngineError {
    pub fn message(&self) -> String {
        match self {
            Self::Platform(msg) => msg.clone(),
            Self::Windows(msg) => msg.clone(),
            Self::AlreadyRunning => "Audio engine is already running. Stop it first.".to_string(),
            Self::InvalidInput(msg) => msg.clone(),
            Self::StreamFailed(msg) => msg.clone(),
        }
    }
}
