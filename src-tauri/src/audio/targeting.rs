use super::types::AudioSessionTarget;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionMatchCandidate {
    pub device_id: String,
    pub session_id: Option<String>,
    pub session_instance_id: Option<String>,
    pub process_id: Option<u32>,
    pub display_name: String,
    pub is_system_sounds: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionMatchError {
    StaleTarget,
    AmbiguousTarget,
}

pub fn match_session_candidate_index(
    candidates: &[SessionMatchCandidate],
    target: &AudioSessionTarget,
) -> Result<usize, SessionMatchError> {
    let device_matches: Vec<usize> = candidates
        .iter()
        .enumerate()
        .filter(|(_, candidate)| candidate.device_id == target.device_id)
        .map(|(index, _)| index)
        .collect();

    if device_matches.is_empty() {
        return Err(SessionMatchError::StaleTarget);
    }

    if let Some(session_id) = target.session_id.as_deref().filter(|value| !value.is_empty()) {
        let mut primary: Vec<usize> = device_matches
            .iter()
            .copied()
            .filter(|index| candidates[*index].session_id.as_deref() == Some(session_id))
            .collect();

        if let Some(instance_id) = target
            .session_instance_id
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            primary.retain(|index| {
                candidates[*index].session_instance_id.as_deref() == Some(instance_id)
            });
        }

        return finalize_unique_match(primary);
    }

    if let Some(instance_id) = target
        .session_instance_id
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        let fallback: Vec<usize> = device_matches
            .iter()
            .copied()
            .filter(|index| {
                candidates[*index].session_instance_id.as_deref() == Some(instance_id)
            })
            .collect();

        if let Ok(index) = finalize_unique_match(fallback) {
            return Ok(index);
        }
    }

    let identifiers_missing = target.session_id.as_deref().unwrap_or("").is_empty()
        && target
            .session_instance_id
            .as_deref()
            .unwrap_or("")
            .is_empty();

    if identifiers_missing {
        let mut loose: Vec<usize> = device_matches;

        if let Some(process_id) = target.process_id {
            loose.retain(|index| candidates[*index].process_id == Some(process_id));
        }

        if loose.len() > 1 {
            if let Some(display_name) = candidates
                .get(loose[0])
                .map(|candidate| candidate.display_name.clone())
            {
                loose.retain(|index| candidates[*index].display_name == display_name);
            }
        }

        if loose.len() > 1 {
            let system_flag = candidates[loose[0]].is_system_sounds;
            loose.retain(|index| candidates[*index].is_system_sounds == system_flag);
        }

        return finalize_unique_match(loose);
    }

    Err(SessionMatchError::StaleTarget)
}

fn finalize_unique_match(indices: Vec<usize>) -> Result<usize, SessionMatchError> {
    match indices.len() {
        1 => Ok(indices[0]),
        0 => Err(SessionMatchError::StaleTarget),
        _ => Err(SessionMatchError::AmbiguousTarget),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(
        device_id: &str,
        session_id: Option<&str>,
        session_instance_id: Option<&str>,
        process_id: Option<u32>,
        display_name: &str,
        is_system_sounds: bool,
    ) -> SessionMatchCandidate {
        SessionMatchCandidate {
            device_id: device_id.to_string(),
            session_id: session_id.map(str::to_string),
            session_instance_id: session_instance_id.map(str::to_string),
            process_id,
            display_name: display_name.to_string(),
            is_system_sounds,
        }
    }

    fn target(
        device_id: &str,
        session_id: Option<&str>,
        session_instance_id: Option<&str>,
        process_id: Option<u32>,
    ) -> AudioSessionTarget {
        AudioSessionTarget {
            device_id: device_id.to_string(),
            session_id: session_id.map(str::to_string),
            session_instance_id: session_instance_id.map(str::to_string),
            process_id,
        }
    }

    #[test]
    fn primary_match_requires_session_and_instance_when_provided() {
        let candidates = vec![candidate(
            "dev-1",
            Some("sid-a"),
            Some("inst-1"),
            Some(100),
            "Chrome",
            false,
        )];

        let matched = match_session_candidate_index(
            &candidates,
            &target("dev-1", Some("sid-a"), Some("inst-1"), Some(100)),
        )
        .expect("match");

        assert_eq!(matched, 0);
    }

    #[test]
    fn ambiguous_when_multiple_primary_matches() {
        let candidates = vec![
            candidate("dev-1", Some("sid-a"), Some("inst-1"), Some(1), "A", false),
            candidate("dev-1", Some("sid-a"), Some("inst-2"), Some(2), "B", false),
        ];

        let error = match_session_candidate_index(
            &candidates,
            &target("dev-1", Some("sid-a"), None, None),
        )
        .expect_err("ambiguous");

        assert_eq!(error, SessionMatchError::AmbiguousTarget);
    }

    #[test]
    fn fallback_matches_instance_id() {
        let candidates = vec![candidate(
            "dev-1",
            None,
            Some("inst-only"),
            Some(42),
            "Spotify",
            false,
        )];

        let matched = match_session_candidate_index(
            &candidates,
            &target("dev-1", None, Some("inst-only"), Some(42)),
        )
        .expect("match");

        assert_eq!(matched, 0);
    }

    #[test]
    fn loose_match_uses_process_and_display_name() {
        let candidates = vec![candidate(
            "dev-1",
            None,
            None,
            Some(900),
            "Discord",
            false,
        )];

        let matched = match_session_candidate_index(
            &candidates,
            &target("dev-1", None, None, Some(900)),
        )
        .expect("match");

        assert_eq!(matched, 0);
    }
}
