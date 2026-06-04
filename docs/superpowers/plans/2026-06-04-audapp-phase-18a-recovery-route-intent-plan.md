# Audapp Phase 18A Recovery Route Intent Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the missing Phase 18A route-intent layer as an honest POC label/state system for discovered Windows audio sessions, while preserving the surviving Phase 17A one-click routing flow and the existing session mute/volume controls.

**Architecture:** Persist per-session route intent in a small JSON store keyed from the existing `AudioSessionTarget` identity fields (`deviceId`, `sessionId`, `sessionInstanceId`, `processId`). Expose that store through three new Tauri commands, then add a frontend hook that loads, sets, clears, and merges route intent onto discovered session rows so the Apps page and Mixer can display and edit the label without claiming real Windows per-app endpoint reassignment.

**Tech Stack:** Rust, Tauri 2 command handlers, Serde/JSON persistence, React 19, TypeScript, existing Audapp session-discovery/session-control hooks, PowerShell verification commands.

---

## File Map

- Create: `C:\Users\musta\Audapp\src-tauri\src\audio\session_intents.rs`
  Responsibility: define the route-intent enum, persisted record shape, stable key builder, JSON load/save/upsert/remove helpers, and Rust unit tests.
- Modify: `C:\Users\musta\Audapp\src-tauri\src\audio\mod.rs`
  Responsibility: register the new audio submodule and re-export the route-intent functions/types used by commands.
- Modify: `C:\Users\musta\Audapp\src-tauri\src\commands.rs`
  Responsibility: add Tauri input DTOs plus `get_session_route_intents`, `set_session_route_intent`, and `clear_session_route_intent`.
- Modify: `C:\Users\musta\Audapp\src-tauri\src\lib.rs`
  Responsibility: add the three new Tauri commands to the invoke handler.
- Reference: `C:\Users\musta\Audapp\src-tauri\src\audio\targeting.rs`
  Responsibility: keep the route-intent key aligned with the existing stable session-targeting rules.
- Reference: `C:\Users\musta\Audapp\src-tauri\src\audio\assignments.rs`
  Responsibility: mirror the repo's existing lightweight JSON persistence pattern and atomic-write behavior.
- Reference: `C:\Users\musta\Audapp\src-tauri\src\audio\mixer_settings.rs`
  Responsibility: mirror the repo's app-data storage schema/version conventions.
- Create: `C:\Users\musta\Audapp\src\types\session-view.ts`
  Responsibility: define the frontend session row shape that includes route-intent state.
- Modify: `C:\Users\musta\Audapp\src\types\session-control.ts`
  Responsibility: add `SessionRouteIntent`, persisted route-intent entry types, and new command input types.
- Modify: `C:\Users\musta\Audapp\src\lib\session-target.ts`
  Responsibility: build the same stable session key on the frontend and expose helpers for discovery rows.
- Create: `C:\Users\musta\Audapp\src\lib\use-session-route-intents.ts`
  Responsibility: load, set, clear, and merge persisted route intent into discovered sessions.
- Modify: `C:\Users\musta\Audapp\src\app\App.tsx`
  Responsibility: wire the route-intent hook, merge it into discovery sessions, and pass the resulting rows/actions into Apps and Mixer.
- Modify: `C:\Users\musta\Audapp\src\components\apps\apps-view.tsx`
  Responsibility: add the route-intent selector, process/PID metadata, and the required POC disclaimer while preserving mute/volume controls.
- Modify: `C:\Users\musta\Audapp\src\components\mixer\mixer-view.tsx`
  Responsibility: show route intent per assigned session and allow changes without rewriting the existing mixer strip layout.
- Create: `C:\Users\musta\Audapp\docs\superpowers\reports\2026-06-02-audapp-phase-18a-recovery-route-intent-report.md`
  Responsibility: capture rollback starting state, restored pieces, build evidence, smoke-test results, limitations, and the exact next recovery step.
- Modify: none under `C:\Users\musta\Audapp\driver\`
  Responsibility: driver/root-device/install/sign flows are explicitly out of scope for this recovery.

## Guardrails

- Keep work on the current dirty `main` worktree.
- Do not create a branch or worktree.
- Do not reset, revert, delete, or commit unrelated files.
- Do not touch driver scripts, root-device flows, `pnputil`, `devgen`, `devcon`, WDK packaging, or Bridge Lab routing behavior.
- Keep route intent messaging honest: this is a POC label only, not real Windows per-app endpoint reassignment.

## Implementation Notes

- Persist route intent rather than keeping it in memory only, because the prompt requires the label to survive refreshes and navigation.
- Use the existing `AudioSessionTarget` identity fields for the store key. If a session lacks `deviceId`, the selector must stay disabled because the session cannot be targeted safely.
- Default any missing route intent to `system`.
- Route-intent options are limited to `system`, `audapp`, `bypass`, and `monitor_only`.
- The frontend currently has no dedicated test runner configured, so backend logic should carry unit tests and frontend changes should be verified through `npm run build` plus the manual smoke flow.

### Task 1: Add the backend route-intent store with Rust tests

**Files:**
- Create: `C:\Users\musta\Audapp\src-tauri\src\audio\session_intents.rs`
- Reference: `C:\Users\musta\Audapp\src-tauri\src\audio\targeting.rs`
- Reference: `C:\Users\musta\Audapp\src-tauri\src\audio\assignments.rs`

- [ ] **Step 1: Create `session_intents.rs` with failing Rust tests first**

```rust
use std::path::PathBuf;

use super::types::AudioSessionTarget;

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("audapp-session-intents-{nanos}"))
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
    fn route_intent_defaults_to_system_when_store_is_empty() {
        let dir = temp_dir();
        let value = get_route_intent_for_target(
            &dir,
            &target("device-1", Some("session-a"), Some("instance-a"), Some(42)),
        )
        .expect("intent");

        assert_eq!(value, SessionRouteIntent::System);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn set_then_load_round_trip_preserves_monitor_only() {
        let dir = temp_dir();
        let saved = set_route_intent_for_target(
            &dir,
            &target("device-1", Some("session-a"), Some("instance-a"), Some(42)),
            SessionRouteIntent::MonitorOnly,
        )
        .expect("saved");

        assert_eq!(saved.intent, SessionRouteIntent::MonitorOnly);

        let loaded = load_session_route_intents(&dir).expect("load");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].intent, SessionRouteIntent::MonitorOnly);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn clear_route_intent_removes_saved_entry() {
        let dir = temp_dir();
        let target = target("device-1", Some("session-a"), Some("instance-a"), Some(42));

        set_route_intent_for_target(&dir, &target, SessionRouteIntent::Audapp).expect("saved");
        clear_route_intent_for_target(&dir, &target).expect("cleared");

        let loaded = load_session_route_intents(&dir).expect("load");
        assert!(loaded.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn route_intent_key_requires_at_least_one_session_identifier() {
        let error = route_intent_key_from_target(&target("device-1", None, None, None))
            .expect_err("invalid input should fail");

        assert_eq!(
            error.message(),
            "Session route intent requires a sessionId, sessionInstanceId, or processId."
        );
    }
}
```

- [ ] **Step 2: Run the targeted Rust test command and confirm it fails because the store functions and enum do not exist yet**

Run: `cargo test session_intents --manifest-path src-tauri\Cargo.toml`

Expected:
- Compile failure mentioning undefined items such as `SessionRouteIntent`, `load_session_route_intents`, or `set_route_intent_for_target`.

- [ ] **Step 3: Replace `session_intents.rs` with the full persisted-store implementation**

```rust
use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

use super::types::AudioSessionTarget;

const SESSION_ROUTE_INTENTS_FILE: &str = "session-route-intents.json";
const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionRouteIntent {
    System,
    Audapp,
    Bypass,
    MonitorOnly,
}

impl Default for SessionRouteIntent {
    fn default() -> Self {
        Self::System
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionRouteIntentEntry {
    pub session_key: String,
    pub intent: SessionRouteIntent,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSessionRouteIntentFile {
    schema_version: u32,
    saved_at: String,
    entries: Vec<SessionRouteIntentEntry>,
}

#[derive(Debug, Clone)]
pub enum SessionRouteIntentError {
    Io(String),
    Parse(String),
    InvalidInput(String),
}

impl SessionRouteIntentError {
    pub fn message(&self) -> String {
        match self {
            Self::Io(message) | Self::Parse(message) | Self::InvalidInput(message) => {
                message.clone()
            }
        }
    }
}

pub fn session_route_intents_file_path(base_dir: &Path) -> PathBuf {
    base_dir.join(SESSION_ROUTE_INTENTS_FILE)
}

pub fn load_session_route_intents(
    base_dir: &Path,
) -> Result<Vec<SessionRouteIntentEntry>, SessionRouteIntentError> {
    let path = session_route_intents_file_path(base_dir);
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(SessionRouteIntentError::Io(format!(
                "Failed to read session route intents: {error}"
            )))
        }
    };

    if bytes.is_empty() {
        return Ok(Vec::new());
    }

    let file: PersistedSessionRouteIntentFile = serde_json::from_slice(&bytes).map_err(|error| {
        SessionRouteIntentError::Parse(format!(
            "Session route intents file is invalid: {error}"
        ))
    })?;

    if file.schema_version != CURRENT_SCHEMA_VERSION {
        return Ok(Vec::new());
    }

    Ok(file.entries)
}

pub fn get_route_intent_for_target(
    base_dir: &Path,
    target: &AudioSessionTarget,
) -> Result<SessionRouteIntent, SessionRouteIntentError> {
    let key = route_intent_key_from_target(target)?;
    let intents = load_session_route_intents(base_dir)?;
    Ok(intents
        .into_iter()
        .find(|entry| entry.session_key == key)
        .map(|entry| entry.intent)
        .unwrap_or_default())
}

pub fn set_route_intent_for_target(
    base_dir: &Path,
    target: &AudioSessionTarget,
    intent: SessionRouteIntent,
) -> Result<SessionRouteIntentEntry, SessionRouteIntentError> {
    let session_key = route_intent_key_from_target(target)?;
    let mut entries = load_session_route_intents(base_dir)?;
    let updated = SessionRouteIntentEntry {
        session_key: session_key.clone(),
        intent,
        updated_at: Utc::now().to_rfc3339(),
    };

    if intent == SessionRouteIntent::System {
        entries.retain(|entry| entry.session_key != session_key);
        save_session_route_intents(base_dir, &entries)?;
        return Ok(updated);
    }

    if let Some(existing) = entries
        .iter_mut()
        .find(|entry| entry.session_key == session_key)
    {
        *existing = updated.clone();
    } else {
        entries.push(updated.clone());
    }

    save_session_route_intents(base_dir, &entries)?;
    Ok(updated)
}

pub fn clear_route_intent_for_target(
    base_dir: &Path,
    target: &AudioSessionTarget,
) -> Result<(), SessionRouteIntentError> {
    let session_key = route_intent_key_from_target(target)?;
    let mut entries = load_session_route_intents(base_dir)?;
    entries.retain(|entry| entry.session_key != session_key);
    save_session_route_intents(base_dir, &entries)
}

pub fn route_intent_key_from_target(
    target: &AudioSessionTarget,
) -> Result<String, SessionRouteIntentError> {
    let device_id = target.device_id.trim();
    if device_id.is_empty() {
        return Err(SessionRouteIntentError::InvalidInput(
            "Session route intent requires a deviceId.".to_string(),
        ));
    }

    let session_id = target.session_id.as_deref().unwrap_or("").trim();
    let session_instance_id = target
        .session_instance_id
        .as_deref()
        .unwrap_or("")
        .trim();
    let process_id = target.process_id;

    if session_id.is_empty() && session_instance_id.is_empty() && process_id.is_none() {
        return Err(SessionRouteIntentError::InvalidInput(
            "Session route intent requires a sessionId, sessionInstanceId, or processId."
                .to_string(),
        ));
    }

    Ok(format!(
        "{}::{}::{}::{}",
        device_id,
        if session_id.is_empty() { "-" } else { session_id },
        if session_instance_id.is_empty() {
            "-"
        } else {
            session_instance_id
        },
        process_id
            .map(|value| value.to_string())
            .unwrap_or_else(|| "-".to_string())
    ))
}

fn save_session_route_intents(
    base_dir: &Path,
    entries: &[SessionRouteIntentEntry],
) -> Result<(), SessionRouteIntentError> {
    fs::create_dir_all(base_dir).map_err(|error| {
        SessionRouteIntentError::Io(format!(
            "Failed to create app data directory: {error}"
        ))
    })?;

    let file = PersistedSessionRouteIntentFile {
        schema_version: CURRENT_SCHEMA_VERSION,
        saved_at: Utc::now().to_rfc3339(),
        entries: entries.to_vec(),
    };

    let json = serde_json::to_string_pretty(&file).map_err(|error| {
        SessionRouteIntentError::Io(format!(
            "Failed to serialize session route intents: {error}"
        ))
    })?;

    atomic_write(&session_route_intents_file_path(base_dir), &json)
}

fn atomic_write(path: &Path, contents: &str) -> Result<(), SessionRouteIntentError> {
    let parent = path.parent().ok_or_else(|| {
        SessionRouteIntentError::Io(
            "Session route intents path has no parent directory.".to_string(),
        )
    })?;

    let temp_path = parent.join(format!(
        "{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(SESSION_ROUTE_INTENTS_FILE)
    ));

    fs::write(&temp_path, contents).map_err(|error| {
        SessionRouteIntentError::Io(format!(
            "Failed to write session route intents temp file: {error}"
        ))
    })?;

    if path.exists() {
        fs::remove_file(path).map_err(|error| {
            SessionRouteIntentError::Io(format!(
                "Failed to replace session route intents file: {error}"
            ))
        })?;
    }

    fs::rename(&temp_path, path).map_err(|error| {
        SessionRouteIntentError::Io(format!(
            "Failed to finalize session route intents file: {error}"
        ))
    })
}
```

- [ ] **Step 4: Export the new store types/functions from `audio/mod.rs`**

```rust
mod assignments;
mod controls;
mod diagnostics;
mod mixer_settings;
mod devices;
mod errors;
mod session_intents;
#[cfg(windows)]
mod process;
#[cfg(windows)]
mod sessions;
mod targeting;
mod types;

pub use session_intents::{
    clear_route_intent_for_target, get_route_intent_for_target, load_session_route_intents,
    route_intent_key_from_target, set_route_intent_for_target, SessionRouteIntent,
    SessionRouteIntentEntry,
};
```

- [ ] **Step 5: Re-run the targeted Rust tests and confirm they pass**

Run: `cargo test session_intents --manifest-path src-tauri\Cargo.toml`

Expected:
- Four passing tests from `audio::session_intents::tests`.

- [ ] **Step 6: Commit the backend store slice**

```bash
git add src-tauri/src/audio/session_intents.rs src-tauri/src/audio/mod.rs
git commit -m "feat(audio): restore session route intent store"
```

### Task 2: Expose route intent through Tauri commands

**Files:**
- Modify: `C:\Users\musta\Audapp\src-tauri\src\commands.rs`
- Modify: `C:\Users\musta\Audapp\src-tauri\src\lib.rs`

- [ ] **Step 1: Extend `commands.rs` imports and request DTOs for route intent**

```rust
use crate::audio::{
    self, clear_route_intent_for_target, load_assignments, load_mixer_channel_settings,
    load_session_route_intents, remove_assignment,
    reset_mixer_channel_settings as reset_persisted_mixer_settings,
    set_route_intent_for_target, set_session_mute_with_snapshot, set_session_volume_with_snapshot,
    upsert_assignment, upsert_mixer_channel_setting, AudioDiscoverySnapshot,
    AudioEndpointDiagnostic, AudioSessionControlResult, AudioSessionTarget, ChannelAssignment,
    ChannelAssignmentMatch, EndpointProbeResult, MixerChannelSetting, SessionRouteIntent,
    SessionRouteIntentEntry,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSessionRouteIntentInput {
    pub target: AudioSessionTarget,
    pub intent: SessionRouteIntent,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearSessionRouteIntentInput {
    pub target: AudioSessionTarget,
}
```

- [ ] **Step 2: Add the three command functions to `commands.rs`**

```rust
#[tauri::command]
pub fn get_session_route_intents(
    app: tauri::AppHandle,
) -> Result<Vec<SessionRouteIntentEntry>, String> {
    let base_dir = app_data_dir(&app)?;
    load_session_route_intents(&base_dir).map_err(|error| error.message())
}

#[tauri::command]
pub fn set_session_route_intent(
    app: tauri::AppHandle,
    input: SetSessionRouteIntentInput,
) -> Result<SessionRouteIntentEntry, String> {
    let base_dir = app_data_dir(&app)?;
    set_route_intent_for_target(&base_dir, &input.target, input.intent)
        .map_err(|error| error.message())
}

#[tauri::command]
pub fn clear_session_route_intent(
    app: tauri::AppHandle,
    input: ClearSessionRouteIntentInput,
) -> Result<(), String> {
    let base_dir = app_data_dir(&app)?;
    clear_route_intent_for_target(&base_dir, &input.target).map_err(|error| error.message())
}
```

- [ ] **Step 3: Register the new commands in `lib.rs`**

```rust
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::get_audio_engine_status,
            commands::get_audio_discovery_snapshot,
            commands::set_audio_session_volume,
            commands::set_audio_session_mute,
            commands::get_session_route_intents,
            commands::set_session_route_intent,
            commands::clear_session_route_intent,
            commands::get_channel_assignments,
            commands::set_channel_assignment,
            commands::remove_channel_assignment,
            commands::get_mixer_channel_settings,
            commands::set_mixer_channel_setting,
            commands::reset_mixer_channel_settings,
            audio_engine_commands::get_audio_engine_runtime_status,
            audio_engine_commands::get_audio_device_formats,
            audio_engine_commands::start_audio_engine_test,
            audio_engine_commands::stop_audio_engine_test,
            audio_engine_commands::get_dsp_config,
            audio_engine_commands::set_dsp_config,
            audio_engine_commands::reset_dsp_config,
            audio_engine_commands::get_dsp_status,
            audio_engine_commands::set_dsp_eq_preset,
            audio_engine_commands::start_audio_routing,
            audio_engine_commands::stop_audio_routing,
            audio_engine_commands::get_audio_routing_status,
            commands::get_audio_endpoint_diagnostics,
            commands::probe_audio_endpoint,
            bridge_commands::start_audio_bridge_poc,
            bridge_commands::stop_audio_bridge_poc,
            bridge_commands::get_audio_bridge_status,
            bridge_commands::list_bridge_candidates,
            routing_commands::routing_get_status_cmd,
            routing_commands::routing_enable_system,
            routing_commands::routing_disable_system,
        ])
```

- [ ] **Step 4: Run a backend compile check before touching the frontend**

Run: `cargo check --manifest-path src-tauri\Cargo.toml`

Expected:
- `Finished` or `Finished dev` without duplicate command-name errors.

- [ ] **Step 5: Commit the command-layer slice**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(tauri): expose session route intent commands"
```

### Task 3: Add frontend route-intent types and the data hook

**Files:**
- Modify: `C:\Users\musta\Audapp\src\types\session-control.ts`
- Create: `C:\Users\musta\Audapp\src\types\session-view.ts`
- Modify: `C:\Users\musta\Audapp\src\lib\session-target.ts`
- Create: `C:\Users\musta\Audapp\src\lib\use-session-route-intents.ts`

- [ ] **Step 1: Extend the shared TypeScript types**

```ts
// src/types/session-control.ts
import type { AudioDiscoverySnapshot } from "@/types/discovery";

export type SessionRouteIntent =
  | "system"
  | "audapp"
  | "bypass"
  | "monitor_only";

export type SessionRouteIntentEntry = {
  sessionKey: string;
  intent: SessionRouteIntent;
  updatedAt: string;
};

export type SetSessionRouteIntentInput = {
  target: AudioSessionTarget;
  intent: SessionRouteIntent;
};

export type ClearSessionRouteIntentInput = {
  target: AudioSessionTarget;
};
```

```ts
// src/types/session-view.ts
import type { AudioDiscoverySession } from "@/types/discovery";
import type { SessionRouteIntent } from "@/types/session-control";

export type AudioSessionView = AudioDiscoverySession & {
  routeIntent: SessionRouteIntent;
  routeIntentKey: string | null;
};
```

- [ ] **Step 2: Add stable-key helpers to `session-target.ts`**

```ts
import type { AudioDiscoverySession } from "@/types/discovery";
import type {
  AudioSessionTarget,
  ChannelAssignmentMatch,
} from "@/types/session-control";

export function sessionRouteIntentKeyFromTarget(target: AudioSessionTarget): string {
  const deviceId = target.deviceId.trim();
  if (!deviceId) {
    throw new Error("Session route intent requires a deviceId.");
  }

  const sessionId = target.sessionId?.trim() ?? "";
  const sessionInstanceId = target.sessionInstanceId?.trim() ?? "";
  const processId = target.processId;

  if (!sessionId && !sessionInstanceId && (processId === undefined || processId === null)) {
    throw new Error(
      "Session route intent requires a sessionId, sessionInstanceId, or processId.",
    );
  }

  return [
    deviceId,
    sessionId || "-",
    sessionInstanceId || "-",
    processId === undefined || processId === null ? "-" : String(processId),
  ].join("::");
}

export function sessionRouteIntentKeyFromDiscovery(
  session: AudioDiscoverySession,
): string | null {
  const target = sessionTargetFromDiscovery(session);
  if (!target) {
    return null;
  }

  try {
    return sessionRouteIntentKeyFromTarget(target);
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Create `use-session-route-intents.ts`**

```ts
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  sessionRouteIntentKeyFromDiscovery,
  sessionTargetFromDiscovery,
} from "@/lib/session-target";
import { invokeCommand, isTauriRuntime } from "@/lib/tauri";
import type { AudioDiscoverySession } from "@/types/discovery";
import type {
  ClearSessionRouteIntentInput,
  SessionRouteIntent,
  SessionRouteIntentEntry,
  SetSessionRouteIntentInput,
} from "@/types/session-control";
import type { AudioSessionView } from "@/types/session-view";

const DEFAULT_ROUTE_INTENT: SessionRouteIntent = "system";

function upsertEntry(
  current: SessionRouteIntentEntry[],
  next: SessionRouteIntentEntry,
): SessionRouteIntentEntry[] {
  if (next.intent === "system") {
    return current.filter((entry) => entry.sessionKey !== next.sessionKey);
  }

  const existingIndex = current.findIndex((entry) => entry.sessionKey === next.sessionKey);
  if (existingIndex === -1) {
    return [...current, next];
  }

  const copy = [...current];
  copy[existingIndex] = next;
  return copy;
}

export function useSessionRouteIntents() {
  const [entries, setEntries] = useState<SessionRouteIntentEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isTauriRuntime()) {
      setEntries([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const next = await invokeCommand<SessionRouteIntentEntry[]>("get_session_route_intents");
      setEntries(next);
      setError(null);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to load session route intents.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const intentBySession = useCallback(
    (session: AudioDiscoverySession): SessionRouteIntent => {
      const key = sessionRouteIntentKeyFromDiscovery(session);
      if (!key) {
        return DEFAULT_ROUTE_INTENT;
      }

      return entries.find((entry) => entry.sessionKey === key)?.intent ?? DEFAULT_ROUTE_INTENT;
    },
    [entries],
  );

  const setIntentForSession = useCallback(
    async (session: AudioDiscoverySession, intent: SessionRouteIntent) => {
      const target = sessionTargetFromDiscovery(session);
      if (!target) {
        setError("This session cannot be targeted safely.");
        return null;
      }

      try {
        const input: SetSessionRouteIntentInput = { target, intent };
        const saved = await invokeCommand<SessionRouteIntentEntry>("set_session_route_intent", {
          input,
        });
        setEntries((current) => upsertEntry(current, saved));
        setError(null);
        return saved;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Failed to save session route intent.";
        setError(message);
        return null;
      }
    },
    [],
  );

  const clearIntentForSession = useCallback(async (session: AudioDiscoverySession) => {
    const target = sessionTargetFromDiscovery(session);
    const key = sessionRouteIntentKeyFromDiscovery(session);

    if (!target || !key) {
      setError("This session cannot be targeted safely.");
      return false;
    }

    try {
      const input: ClearSessionRouteIntentInput = { target };
      await invokeCommand<void>("clear_session_route_intent", { input });
      setEntries((current) => current.filter((entry) => entry.sessionKey !== key));
      setError(null);
      return true;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to clear session route intent.";
      setError(message);
      return false;
    }
  }, []);

  const mergeSessions = useMemo(
    () => (sessions: AudioDiscoverySession[]): AudioSessionView[] =>
      sessions.map((session) => ({
        ...session,
        routeIntent: intentBySession(session),
        routeIntentKey: sessionRouteIntentKeyFromDiscovery(session),
      })),
    [intentBySession],
  );

  return {
    entries,
    isLoading,
    error,
    refresh,
    intentBySession,
    setIntentForSession,
    clearIntentForSession,
    mergeSessions,
  };
}
```

- [ ] **Step 4: Run the frontend build once the type and hook layer is in place**

Run: `npm run build`

Expected:
- Successful TypeScript/Vite build.
- No unresolved import errors for `session-view` or `use-session-route-intents`.

- [ ] **Step 5: Commit the frontend data-layer slice**

```bash
git add src/types/session-control.ts src/types/session-view.ts src/lib/session-target.ts src/lib/use-session-route-intents.ts
git commit -m "feat(ui): add session route intent data hook"
```

### Task 4: Restore route intent controls on the Apps page

**Files:**
- Modify: `C:\Users\musta\Audapp\src\app\App.tsx`
- Modify: `C:\Users\musta\Audapp\src\components\apps\apps-view.tsx`

- [ ] **Step 1: Wire the route-intent hook into `App.tsx` and pass merged sessions into Apps**

```ts
import { useSessionRouteIntents } from "@/lib/use-session-route-intents";
import type { SessionRouteIntent } from "@/types/session-control";

const routeIntentOptions: Array<{ value: SessionRouteIntent; label: string }> = [
  { value: "system", label: "System" },
  { value: "audapp", label: "Audapp" },
  { value: "bypass", label: "Bypass" },
  { value: "monitor_only", label: "Monitor only" },
];

export default function App() {
  const sessionRouteIntents = useSessionRouteIntents();
  const sessionViews = useMemo(
    () => sessionRouteIntents.mergeSessions(discoverySessions),
    [discoverySessions, sessionRouteIntents],
  );

  const content = {
    apps: (
      <AppsView
        sessions={sessionViews}
        channels={channels}
        outputDevices={outputDevices}
        channelIdForSession={channelAssignments.channelIdForSession}
        isLoading={isDiscoveryLoading}
        isAssignmentsLoading={channelAssignments.isLoading}
        assignmentsError={channelAssignments.error ?? sessionRouteIntents.error}
        isSessionPending={sessionControl.isPending}
        sessionError={sessionControl.sessionError}
        routeIntentOptions={routeIntentOptions}
        onRouteIntentChange={(session, intent) => {
          if (intent === "system") {
            void sessionRouteIntents.clearIntentForSession(session);
            return;
          }
          void sessionRouteIntents.setIntentForSession(session, intent);
        }}
        onChannelChange={(session, channelId) => {
          const channel = channels.find((item) => item.id === channelId);
          void channelAssignments.setAssignmentForSession(
            session,
            channelId,
            channel?.name ?? session.displayName,
          );
        }}
        onVolumeCommit={(session, volumePercent) => {
          void sessionControl.setVolume(session, volumePercent);
        }}
        onMuteToggle={(session, muted) => {
          void sessionControl.setMuted(session, muted);
        }}
        onRefresh={() => {
          void Promise.all([
            refreshDiscovery(),
            sessionRouteIntents.refresh(),
          ]);
        }}
      />
    ),
  };
}
```

- [ ] **Step 2: Update `apps-view.tsx` so each session card shows PID/process metadata, the selector, and the required disclaimer**

```tsx
import type { SessionRouteIntent } from "@/types/session-control";
import type { AudioSessionView } from "@/types/session-view";

interface AppsViewProps {
  sessions: AudioSessionView[];
  channels: AudioChannel[];
  outputDevices: AudioDiscoveryDevice[];
  channelIdForSession: (session: AudioSessionView, fallbackChannelId: string) => string;
  isLoading: boolean;
  isAssignmentsLoading: boolean;
  assignmentsError: string | null;
  isSessionPending: (session: AudioSessionView) => boolean;
  sessionError: (session: AudioSessionView) => string | null;
  routeIntentOptions: Array<{ value: SessionRouteIntent; label: string }>;
  onRouteIntentChange: (session: AudioSessionView, intent: SessionRouteIntent) => void;
  onChannelChange: (session: AudioSessionView, channelId: string) => void;
  onVolumeCommit: (session: AudioSessionView, volumePercent: number) => void;
  onMuteToggle: (session: AudioSessionView, muted: boolean) => void;
  onRefresh: () => void;
}
```

```tsx
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-tight">
                    {sessionDisplayLabel(session)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {session.processName ?? "Unknown process"}
                    {session.processId ? ` • PID ${session.processId}` : ""}
                  </p>
                </div>
```

```tsx
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs text-muted-foreground">Route intent</span>
                    <Select
                      value={session.routeIntent}
                      disabled={!session.routeIntentKey || pending}
                      onValueChange={(value) =>
                        onRouteIntentChange(session, value as SessionRouteIntent)
                      }
                    >
                      <SelectTrigger className="h-7 flex-1 text-xs">
                        <SelectValue placeholder="System" />
                      </SelectTrigger>
                      <SelectContent>
                        {routeIntentOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            className="text-xs"
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Route intent is a POC label. Windows per-app routing comes later.
                  </p>
                </div>
```

- [ ] **Step 3: Rebuild after the Apps page changes**

Run: `npm run build`

Expected:
- Successful build.
- No prop-type mismatch between `App.tsx` and `AppsView`.

- [ ] **Step 4: Commit the Apps-page slice**

```bash
git add src/app/App.tsx src/components/apps/apps-view.tsx
git commit -m "feat(apps): restore session route intent controls"
```

### Task 5: Show route intent in Mixer without rewriting the mixer layout

**Files:**
- Modify: `C:\Users\musta\Audapp\src\app\App.tsx`
- Modify: `C:\Users\musta\Audapp\src\components\mixer\mixer-view.tsx`

- [ ] **Step 1: Extend `App.tsx` so Mixer receives merged session rows and the route-intent actions**

```ts
    mixer: (
      <MixerView
        channels={channels}
        sessions={sessionViews}
        channelIdForSession={channelAssignments.channelIdForSession}
        routeIntentOptions={routeIntentOptions}
        assignmentCountsByChannel={assignmentCountsByChannel}
        outputDevices={mixerOutputDevices.length > 0 ? mixerOutputDevices : []}
        onRouteIntentChange={(session, intent) => {
          if (intent === "system") {
            void sessionRouteIntents.clearIntentForSession(session);
            return;
          }
          void sessionRouteIntents.setIntentForSession(session, intent);
        }}
        onVolumeChange={(id, value) =>
          updateChannel(id, (channel) => ({
            ...channel,
            volume: value,
            peak: Math.min(100, value + 6),
            meterHold: Math.min(100, value + 12),
          }))
        }
        onVolumeCommit={(id, value) => {
          updateChannel(id, (channel) => ({ ...channel, volume: value }));
          void handleMixerVolumeCommit(id, value);
        }}
        onMuteToggle={(id, newMuted) => {
          void handleMixerMuteToggle(id, newMuted);
        }}
        onSoloToggle={(id) =>
          updateChannel(id, (channel) => ({ ...channel, solo: !channel.solo }))
        }
        onOutputChange={(id, outputDeviceId) =>
          updateChannel(id, (channel) => ({ ...channel, outputDeviceId }))
        }
        channelErrors={channelErrors}
        channelIsPending={channelIsPending}
        settingsError={mixerChannelSettings.error}
        settingsWarning={mixerChannelSettings.loadWarning}
      />
    ),
```

- [ ] **Step 2: Add a compact assigned-session list with route-intent selectors under the existing mixer strips**

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sessionDisplayLabel } from "@/lib/discovery-display";
import type { SessionRouteIntent } from "@/types/session-control";
import type { AudioSessionView } from "@/types/session-view";

interface MixerViewProps {
  channels: AudioChannel[];
  sessions: AudioSessionView[];
  channelIdForSession: (session: AudioSessionView, fallbackChannelId: string) => string;
  routeIntentOptions: Array<{ value: SessionRouteIntent; label: string }>;
  assignmentCountsByChannel: Record<string, number>;
  outputDevices: AudioDevice[];
  onRouteIntentChange: (session: AudioSessionView, intent: SessionRouteIntent) => void;
  onVolumeChange: (id: string, value: number) => void;
  onVolumeCommit: (id: string, value: number) => void;
  onMuteToggle: (id: string, newMuted: boolean) => void;
  onSoloToggle: (id: string) => void;
  onOutputChange: (id: string, outputDeviceId: string) => void;
  channelErrors: Record<string, string>;
  channelIsPending: (id: string) => boolean;
  settingsError?: string | null;
  settingsWarning?: string | null;
}
```

```tsx
      <div className="grid gap-3 lg:grid-cols-2">
        {props.channels.map((channel) => {
          const channelSessions = props.sessions.filter(
            (session) => props.channelIdForSession(session, props.channels[0]?.id ?? "") === channel.id,
          );

          return (
            <div key={`${channel.id}-sessions`} className="rounded-xl bg-card px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{channel.name}</p>
                <p className="text-xs text-muted-foreground">
                  {channelSessions.length === 0 ? "No assigned sessions" : `${channelSessions.length} session(s)`}
                </p>
              </div>

              <div className="mt-3 space-y-2">
                {channelSessions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Route intent appears here for sessions assigned to this mixer channel.
                  </p>
                ) : (
                  channelSessions.map((session) => (
                    <div
                      key={`${channel.id}-${session.id}`}
                      className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {sessionDisplayLabel(session)}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {session.processName ?? "Unknown process"}
                          {session.processId ? ` • PID ${session.processId}` : ""}
                        </p>
                      </div>
                      <Select
                        value={session.routeIntent}
                        disabled={!session.routeIntentKey}
                        onValueChange={(value) =>
                          props.onRouteIntentChange(session, value as SessionRouteIntent)
                        }
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue placeholder="System" />
                        </SelectTrigger>
                        <SelectContent>
                          {props.routeIntentOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value} className="text-xs">
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
```

- [ ] **Step 3: Rebuild after the Mixer changes**

Run: `npm run build`

Expected:
- Successful build.
- Mixer still renders its channel strips and now includes the route-intent session summary block.

- [ ] **Step 4: Commit the Mixer slice**

```bash
git add src/app/App.tsx src/components/mixer/mixer-view.tsx
git commit -m "feat(mixer): surface session route intent labels"
```

### Task 6: Run full verification, smoke test, and write the recovery report

**Files:**
- Create: `C:\Users\musta\Audapp\docs\superpowers\reports\2026-06-02-audapp-phase-18a-recovery-route-intent-report.md`

- [ ] **Step 1: Re-run the required backend verification**

Run: `cargo check --manifest-path src-tauri\Cargo.toml`

Expected:
- Successful `cargo check` with no errors in `session_intents`, `commands`, or `lib`.

- [ ] **Step 2: Re-run the required frontend verification**

Run: `npm run build`

Expected:
- Successful production build with no TypeScript errors.

- [ ] **Step 3: Start the app for manual smoke testing if the local environment allows it**

Run: `npm run tauri dev`

Expected:
- The app window opens.
- Bridge Lab still loads.
- Apps and Mixer pages render the new route-intent selector.

- [ ] **Step 4: Execute the manual smoke checklist and record the result**

```text
1. Start Audapp.
2. Enable Audapp Routing from Bridge Lab.
3. Play audio in Edge, Chrome, or Spotify.
4. Open Apps page.
5. Confirm session names appear.
6. Confirm mute and volume controls still work.
7. Change route intent to Audapp.
8. Refresh discovery or navigate away and back.
9. Confirm route intent remains.
10. Change route intent to Bypass.
11. Confirm UI shows Bypass.
12. Confirm copy does not claim real per-app endpoint routing yet.
13. Open Mixer and confirm route intent is shown there too.
14. Confirm Bridge Lab still routes audio.
```

- [ ] **Step 5: Write the recovery report with concrete evidence**

```markdown
# Audapp Phase 18A Recovery Route Intent Report

## 1. Starting rollback state

- Snapshot baseline: `Audapp one-click system routing working - Phase 17A`
- Branch: `main`
- Driver status: healthy
- Device: `ROOT\DEVGEN\AUDAPP12G0001`
- Driver service: `AudioCodec`
- `cargo check`: passed before implementation
- `npm run build`: passed before implementation

## 2. Driver preflight result

- No driver, root-device, `pnputil`, `devcon`, `devgen`, or WDK packaging files were modified.
- Bridge Lab routing commands remained intact during this recovery.

## 3. Surviving Phase 18A pieces

- Session discovery remained available through `get_audio_discovery_snapshot`.
- Session mute/volume controls remained available through `set_audio_session_volume` and `set_audio_session_mute`.
- Channel assignment persistence remained available through `assignments.rs`.
- Mixer channel persistence remained available through `mixer_settings.rs`.

## 4. Route intent pieces restored

- Added persisted backend store: `src-tauri/src/audio/session_intents.rs`
- Added Tauri commands:
  - `get_session_route_intents`
  - `set_session_route_intent`
  - `clear_session_route_intent`
- Added frontend types/hook:
  - `src/types/session-view.ts`
  - `src/lib/use-session-route-intents.ts`
- Added Apps and Mixer route-intent UI with the required POC disclaimer.

## 5. Files changed

- `src-tauri/src/audio/session_intents.rs`
- `src-tauri/src/audio/mod.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/src/lib.rs`
- `src/types/session-control.ts`
- `src/types/session-view.ts`
- `src/lib/session-target.ts`
- `src/lib/use-session-route-intents.ts`
- `src/app/App.tsx`
- `src/components/apps/apps-view.tsx`
- `src/components/mixer/mixer-view.tsx`

## 6. Build results

- `cargo check --manifest-path src-tauri\Cargo.toml`: PASS
- `npm run build`: PASS

## 7. Manual smoke test

- Result: PASS or NOT RUN
- Notes:
  - Route intent persisted across refresh/navigation.
  - Session mute/volume continued to work.
  - Bridge Lab routing still worked.

## 8. Known limitations

- Route intent is still a POC label only.
- No real Windows per-app endpoint reassignment is implemented yet.
- Internal channels are still out of scope.
- Channel rules/persistence follow-up is still out of scope.

## 9. Next recovery step

- Restore Phase 18B internal channels on top of the recovered Phase 18A route-intent layer.
```

- [ ] **Step 6: Capture the final Git status for the response**

Run: `git status --short`

Expected:
- Only the intended route-intent files plus the new report and this plan appear as new/modified paths.

- [ ] **Step 7: Commit the integrated recovery once verification is complete**

```bash
git add src-tauri/src/audio/session_intents.rs src-tauri/src/audio/mod.rs src-tauri/src/commands.rs src-tauri/src/lib.rs src/types/session-control.ts src/types/session-view.ts src/lib/session-target.ts src/lib/use-session-route-intents.ts src/app/App.tsx src/components/apps/apps-view.tsx src/components/mixer/mixer-view.tsx docs/superpowers/reports/2026-06-02-audapp-phase-18a-recovery-route-intent-report.md docs/superpowers/plans/2026-06-04-audapp-phase-18a-recovery-route-intent-plan.md
git commit -m "feat(route-intent): restore phase 18a session labeling"
```

## Plan Self-Review

- Spec coverage:
  - Backend store: covered in Task 1.
  - Tauri commands and wiring: covered in Task 2.
  - Frontend types/hook: covered in Task 3.
  - Apps UI disclaimer and selector: covered in Task 4.
  - Mixer display/control: covered in Task 5.
  - Verification and report output: covered in Task 6.
- Placeholder scan:
  - No placeholder markers or cross-task shorthand remain.
- Type consistency:
  - The same `SessionRouteIntent` values are used end-to-end: `system`, `audapp`, `bypass`, `monitor_only`.
  - The persisted key is built from the same four fields on both backend and frontend.

Plan complete and saved to `docs/superpowers/plans/2026-06-04-audapp-phase-18a-recovery-route-intent-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
