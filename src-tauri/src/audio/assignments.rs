use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::types::{AudioDiscoverySession, ChannelAssignment, ChannelAssignmentMatch};

const ASSIGNMENTS_FILE: &str = "channel-assignments.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AssignmentStore {
    assignments: Vec<ChannelAssignment>,
}

#[derive(Debug, Clone)]
pub enum AssignmentError {
    Io(String),
    Parse(String),
    NotFound,
    InvalidInput(String),
}

impl AssignmentError {
    pub fn message(&self) -> String {
        match self {
            Self::Io(message) | Self::Parse(message) | Self::InvalidInput(message) => message.clone(),
            Self::NotFound => "Channel assignment was not found.".to_string(),
        }
    }
}

pub fn assignments_file_path(base_dir: &Path) -> PathBuf {
    base_dir.join(ASSIGNMENTS_FILE)
}

pub fn load_assignments(base_dir: &Path) -> Result<Vec<ChannelAssignment>, AssignmentError> {
    let path = assignments_file_path(base_dir);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = fs::read_to_string(&path).map_err(|error| {
        AssignmentError::Io(format!("Failed to read channel assignments: {error}"))
    })?;

    if contents.trim().is_empty() {
        return Ok(Vec::new());
    }

    let store: AssignmentStore = serde_json::from_str(&contents).map_err(|error| {
        AssignmentError::Parse(format!("Channel assignments file is invalid: {error}"))
    })?;

    Ok(store.assignments)
}

pub fn save_assignments(
    base_dir: &Path,
    assignments: &[ChannelAssignment],
) -> Result<(), AssignmentError> {
    fs::create_dir_all(base_dir).map_err(|error| {
        AssignmentError::Io(format!("Failed to create app data directory: {error}"))
    })?;

    let store = AssignmentStore {
        assignments: assignments.to_vec(),
    };

    let serialized = serde_json::to_string_pretty(&store).map_err(|error| {
        AssignmentError::Io(format!("Failed to serialize channel assignments: {error}"))
    })?;

    atomic_write(&assignments_file_path(base_dir), &serialized)
}

pub fn upsert_assignment(
    base_dir: &Path,
    channel_id: String,
    match_rule: ChannelAssignmentMatch,
    label: String,
) -> Result<ChannelAssignment, AssignmentError> {
    if channel_id.trim().is_empty() {
        return Err(AssignmentError::InvalidInput(
            "channelId is required.".to_string(),
        ));
    }

    if label.trim().is_empty() {
        return Err(AssignmentError::InvalidInput(
            "label is required.".to_string(),
        ));
    }

    let mut assignments = load_assignments(base_dir)?;
    let now = Utc::now().to_rfc3339();

    if let Some(existing) = find_matching_assignment_index(&assignments, &match_rule) {
        let entry = &mut assignments[existing];
        entry.channel_id = channel_id;
        entry.match_rule = match_rule;
        entry.label = label;
        entry.updated_at = now;
        let saved = entry.clone();
        save_assignments(base_dir, &assignments)?;
        return Ok(saved);
    }

    let created = ChannelAssignment {
        id: Uuid::new_v4().to_string(),
        channel_id,
        match_rule,
        label,
        created_at: now.clone(),
        updated_at: now,
    };

    assignments.push(created.clone());
    save_assignments(base_dir, &assignments)?;
    Ok(created)
}

pub fn remove_assignment(base_dir: &Path, assignment_id: &str) -> Result<(), AssignmentError> {
    let mut assignments = load_assignments(base_dir)?;
    let original_len = assignments.len();
    assignments.retain(|assignment| assignment.id != assignment_id);

    if assignments.len() == original_len {
        return Err(AssignmentError::NotFound);
    }

    save_assignments(base_dir, &assignments)
}

pub fn channel_id_for_session(
    assignments: &[ChannelAssignment],
    session: &AudioDiscoverySession,
) -> Option<String> {
    select_assignment_for_session(assignments, session).map(|assignment| assignment.channel_id.clone())
}

pub fn select_assignment_for_session<'a>(
    assignments: &'a [ChannelAssignment],
    session: &AudioDiscoverySession,
) -> Option<&'a ChannelAssignment> {
    assignments
        .iter()
        .filter(|assignment| assignment_matches_session(assignment, session))
        .max_by_key(|assignment| assignment_match_score(assignment, session))
}

pub fn assignment_matches_session(
    assignment: &ChannelAssignment,
    session: &AudioDiscoverySession,
) -> bool {
    assignment_match_score(assignment, session) > 0
}

pub fn assignment_match_score(
    assignment: &ChannelAssignment,
    session: &AudioDiscoverySession,
) -> u8 {
    let rule = &assignment.match_rule;

    if let (Some(rule_path), Some(session_path)) =
        (rule.executable_path.as_deref(), session.executable_path.as_deref())
    {
        if !rule_path.is_empty() && rule_path.eq_ignore_ascii_case(session_path) {
            return 4;
        }
    }

    if let (Some(rule_name), Some(session_name)) =
        (rule.process_name.as_deref(), session.process_name.as_deref())
    {
        if !rule_name.is_empty() && rule_name.eq_ignore_ascii_case(session_name) {
            return 3;
        }
    }

    if let (Some(rule_display), Some(session_display)) = (
        rule.session_display_name.as_deref(),
        Some(session.display_name.as_str()),
    ) {
        if !rule_display.is_empty() && rule_display.eq_ignore_ascii_case(session_display) {
            return 2;
        }
    }

    if let (Some(rule_pid), Some(session_pid)) = (rule.process_id, session.process_id) {
        if rule_pid == session_pid {
            return 1;
        }
    }

    0
}

fn find_matching_assignment_index(
    assignments: &[ChannelAssignment],
    match_rule: &ChannelAssignmentMatch,
) -> Option<usize> {
    assignments.iter().position(|assignment| {
        assignment.match_rule.process_name == match_rule.process_name
            && assignment.match_rule.executable_path == match_rule.executable_path
            && assignment.match_rule.session_display_name == match_rule.session_display_name
            && assignment.match_rule.process_id == match_rule.process_id
    })
}

fn atomic_write(path: &Path, contents: &str) -> Result<(), AssignmentError> {
    let parent = path.parent().ok_or_else(|| {
        AssignmentError::Io("Assignments path has no parent directory.".to_string())
    })?;

    let temp_path = parent.join(format!(
        "{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(ASSIGNMENTS_FILE)
    ));

    fs::write(&temp_path, contents).map_err(|error| {
        AssignmentError::Io(format!("Failed to write channel assignments temp file: {error}"))
    })?;

    if path.exists() {
        fs::remove_file(path).map_err(|error| {
            AssignmentError::Io(format!("Failed to replace channel assignments file: {error}"))
        })?;
    }

    fs::rename(&temp_path, path).map_err(|error| {
        AssignmentError::Io(format!("Failed to finalize channel assignments file: {error}"))
    })
}

pub fn match_rule_from_session(session: &AudioDiscoverySession) -> ChannelAssignmentMatch {
    ChannelAssignmentMatch {
        executable_path: session.executable_path.clone(),
        process_name: session.process_name.clone(),
        session_display_name: Some(session.display_name.clone()),
        process_id: session.process_id,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("audapp-assignments-{nanos}"))
    }

    fn sample_session() -> AudioDiscoverySession {
        AudioDiscoverySession {
            id: "dev::inst".to_string(),
            session_id: Some("sid".to_string()),
            session_instance_id: Some("inst".to_string()),
            display_name: "Chrome".to_string(),
            process_id: Some(42),
            process_name: Some("chrome.exe".to_string()),
            executable_path: Some("C:\\Program Files\\Google\\Chrome\\chrome.exe".to_string()),
            device_id: Some("dev".to_string()),
            state: "active".to_string(),
            volume: Some(50.0),
            muted: Some(false),
            is_system_sounds: false,
        }
    }

    #[test]
    fn assignment_priority_prefers_executable_path() {
        let session = sample_session();
        let assignments = vec![
            ChannelAssignment {
                id: "pid".to_string(),
                channel_id: "chat".to_string(),
                match_rule: ChannelAssignmentMatch {
                    process_id: Some(42),
                    process_name: None,
                    executable_path: None,
                    session_display_name: None,
                },
                label: "pid".to_string(),
                created_at: "now".to_string(),
                updated_at: "now".to_string(),
            },
            ChannelAssignment {
                id: "path".to_string(),
                channel_id: "browser".to_string(),
                match_rule: ChannelAssignmentMatch {
                    process_id: None,
                    process_name: None,
                    executable_path: Some(
                        "C:\\Program Files\\Google\\Chrome\\chrome.exe".to_string(),
                    ),
                    session_display_name: None,
                },
                label: "path".to_string(),
                created_at: "now".to_string(),
                updated_at: "now".to_string(),
            },
        ];

        let selected = select_assignment_for_session(&assignments, &session).expect("assignment");
        assert_eq!(selected.channel_id, "browser");
    }

    #[test]
    fn save_and_load_round_trip() {
        let dir = temp_dir();
        let assignment = ChannelAssignment {
            id: "a1".to_string(),
            channel_id: "game".to_string(),
            match_rule: ChannelAssignmentMatch {
                process_name: Some("game.exe".to_string()),
                executable_path: None,
                process_id: None,
                session_display_name: None,
            },
            label: "Game".to_string(),
            created_at: "t".to_string(),
            updated_at: "t".to_string(),
        };

        save_assignments(&dir, &[assignment.clone()]).expect("save");
        let loaded = load_assignments(&dir).expect("load");

        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].channel_id, "game");

        let _ = fs::remove_dir_all(dir);
    }
}
