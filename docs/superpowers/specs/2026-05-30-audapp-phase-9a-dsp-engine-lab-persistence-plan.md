# Audapp Phase 9A — DSP / Engine Lab Persistence Plan

**Date:** 2026-05-30  
**Phase:** 9A (Planning)  
**Next Phase:** 9B (Implementation — see Sonnet build prompt)

---

## 1. Current Codebase Findings

### 1.1 DSP Config Shape

The complete persisted-to-disk type will wrap `DspRuntimeConfig` from `src-tauri/src/audio_engine/dsp/types.rs`:

```rust
pub struct DspRuntimeConfig {
    pub enabled: bool,
    pub output_gain_db: f32,       // -24..+12 dB (clamped in set_config)
    pub input_gain_db: f32,        // -24..+12 dB (clamped in set_config)
    pub high_pass_enabled: bool,
    pub high_pass_hz: f32,         // 20..300 Hz (clamped)
    pub low_pass_enabled: bool,
    pub low_pass_hz: f32,          // 4000..20000 Hz (clamped)
    pub limiter_enabled: bool,     // default: true
    pub eq_enabled: bool,
    pub eq_preset: String,         // "flat" | "gaming" | "music" | "voice_clarity" | "bass_boost" | "custom"
    pub eq_bands: Vec<EqBandConfig>,  // 5 bands: 100, 250, 1k, 4k, 10k Hz
}

pub struct EqBandConfig {
    pub id: String,
    pub frequency_hz: f32,
    pub gain_db: f32,   // -12..+12 dB
    pub enabled: bool,
}
```

This type is already `#[derive(Serialize, Deserialize)]`. No new types needed.

### 1.2 Existing DSP Tauri Commands

All commands are registered in `src-tauri/src/lib.rs` and implemented in `src-tauri/src/audio_engine_commands.rs`:

| Command | Current Signature | Action |
|---------|------------------|--------|
| `get_dsp_config` | `() -> DspRuntimeConfig` | Returns current in-memory config |
| `set_dsp_config` | `(config: DspRuntimeConfig) -> DspRuntimeStatus` | Applies config to atomic shared state |
| `reset_dsp_config` | `() -> DspRuntimeConfig` | Resets to defaults |
| `get_dsp_status` | `() -> DspRuntimeStatus` | Returns engine-reported status |
| `set_dsp_eq_preset` | `(preset: String) -> DspRuntimeStatus` | Applies named preset + auto-enables EQ |

### 1.3 Current Persistence Status

- **DSP config: in-memory only.** The `DspConfigShared` is stored in `OnceLock<DspConfigShared>` with no file I/O.
- **Channel assignments: file-persisted.** The pattern at `src-tauri/src/audio/assignments.rs` uses `app_local_data_dir`, atomic temp+rename writes, and `serde_json`.
- **No other persistence** found in the audio engine code.

### 1.4 Frontend / UI

- Both **Engine Lab** (`src/components/engine/engine-lab-view.tsx`) and **Equalizer** (`src/components/eq/equalizer-view.tsx`) use the same `useAudioDsp()` hook.
- The hook is provided by `<AudioDspProvider>` which wraps the entire app in `src/app/App.tsx:365`.
- The hook calls `get_dsp_config` on mount — once we load persisted config at app startup, the frontend automatically receives the restored state.
- The hook uses 100 ms throttle on slider drags, calling `set_dsp_config` at most 10×/second. This is acceptable for file I/O.

### 1.5 Debug Instrumentation

**None found.** No `println!`, `eprintln!`, `console.log`, or `log::*` in audio engine or DSP code. Codebase is clean.

### 1.6 Blockers Found

**None.** The DSP pipeline is functional, the existing commands work, and the codebase is clean. Phase 9B can proceed to persistence without any stabilization work.

---

## 2. Persistence Architecture Plan

### 2.1 Module Location

New file: `src-tauri/src/audio_engine/dsp/persistence.rs`

This is co-located with the DSP config types and follows the existing module layout. No restructuring required.

### 2.2 File Path

```
<AppLocalDataDir>\engine-lab-dsp-config.json
```

**Rationale for filename:** `engine-lab-dsp-config.json` clearly describes the scope (Engine Lab, not production audio). This mirrors the `channel-assignments.json` naming convention.

The `AppLocalDataDir` is resolved via `app.path().app_local_data_dir()` — the same API already used in `src-tauri/src/commands.rs` for channel assignments.

On Windows, this resolves to `%LOCALAPPDATA%\com.audapp.app\`.

### 2.3 Atomic Write Pattern

Mirror the `channel-assignments.rs` pattern exactly:

```rust
// 1. Create parent directory if missing
fs::create_dir_all(&parent)?;

// 2. Write serialized JSON to a temp file
let tmp_path = path.with_extension("tmp");
fs::write(&tmp_path, json_bytes)?;

// 3. Atomic rename (OS-level atomic on Windows)
fs::rename(&tmp_path, &path)?;
```

This prevents partial writes from corrupting the persisted config if the process crashes mid-write.

### 2.4 Load Strategy

Load is **lazy on first app startup**, called from `lib.rs` setup before any Tauri commands are processed:

```
App start → setup() → load persisted config → apply to DspConfigShared → frontend calls get_dsp_config → sees restored state
```

If the file is missing or malformed, defaults are applied silently (normal first-run experience).

---

## 3. Persisted Schema Plan

### 3.1 File Structure

```json
{
  "schema_version": 1,
  "saved_at": "2026-05-30T14:23:11.123Z",
  "dsp": {
    "enabled": true,
    "output_gain_db": 3.5,
    "input_gain_db": 0.0,
    "high_pass_enabled": false,
    "high_pass_hz": 80.0,
    "low_pass_enabled": false,
    "low_pass_hz": 16000.0,
    "limiter_enabled": true,
    "eq_enabled": true,
    "eq_preset": "gaming",
    "eq_bands": [
      { "id": "band_100hz", "frequency_hz": 100.0, "gain_db": 2.0, "enabled": true },
      { "id": "band_250hz", "frequency_hz": 250.0, "gain_db": 1.0, "enabled": true },
      { "id": "band_1000hz", "frequency_hz": 1000.0, "gain_db": -1.0, "enabled": true },
      { "id": "band_4000hz", "frequency_hz": 4000.0, "gain_db": 3.0, "enabled": true },
      { "id": "band_10000hz", "frequency_hz": 10000.0, "gain_db": 2.0, "enabled": true }
    ]
  }
}
```

### 3.2 Rust Schema Struct

```rust
#[derive(Serialize, Deserialize, Debug)]
pub struct PersistedDspConfigFile {
    pub schema_version: u32,   // = 1
    pub saved_at: String,      // RFC3339 (from chrono::Utc::now().to_rfc3339())
    pub dsp: DspRuntimeConfig,
}
```

### 3.3 Fields to Persist

**Persist:**
- `enabled` — user's primary DSP on/off toggle
- `output_gain_db` — output gain preference
- `input_gain_db` — input gain preference
- `high_pass_enabled`, `high_pass_hz` — filter preference
- `low_pass_enabled`, `low_pass_hz` — filter preference
- `limiter_enabled` — limiter preference
- `eq_enabled` — EQ on/off
- `eq_preset` — named preset or "custom"
- `eq_bands` — all 5 band configs (id, frequency_hz, gain_db, enabled)

**Do not persist separately (not part of DspRuntimeConfig):**
- Engine running/stopped state
- Peak/RMS meter values
- Glitch count
- Live status timestamps
- Test tone frequency/gain (deferred — adds risk with no clear benefit now)
- Selected output/input device (deferred — device IDs can become stale between sessions)

### 3.4 Schema Versioning

`schema_version: 1` is checked on load. If version is unknown (e.g., a future version read by older code), fallback to defaults. This prevents invalid deserialization across schema migrations.

### 3.5 Value Clamping on Load

Even though values are clamped when saved via `set_dsp_config`, clamp again on load as a defensive measure:

```rust
fn clamp_config(mut config: DspRuntimeConfig) -> DspRuntimeConfig {
    config.output_gain_db = config.output_gain_db.clamp(-24.0, 12.0);
    config.input_gain_db = config.input_gain_db.clamp(-24.0, 12.0);
    config.high_pass_hz = config.high_pass_hz.clamp(20.0, 300.0);
    config.low_pass_hz = config.low_pass_hz.clamp(4000.0, 20000.0);
    for band in &mut config.eq_bands {
        band.gain_db = band.gain_db.clamp(-12.0, 12.0);
    }
    config
}
```

This prevents any hand-edited or future-schema value from causing unsafe filter coefficients.

---

## 4. Command Contract Plan

### 4.1 Recommended Approach: Approach A (Transparent Persistence)

Persistence is wired into the existing commands by adding `tauri::AppHandle` as a parameter. No new commands are needed. The frontend hook requires **zero changes**.

| Command | Change | Behavior |
|---------|--------|----------|
| `set_dsp_config` | Add `app: tauri::AppHandle` | Applies config to atomics, then saves to file |
| `reset_dsp_config` | Add `app: tauri::AppHandle` | Resets atomics to defaults, then deletes persisted file |
| `set_dsp_eq_preset` | Add `app: tauri::AppHandle` | Applies preset to atomics, then reads current config and saves |
| `get_dsp_config` | No change | Returns current in-memory config (loaded from file at startup) |
| `get_dsp_status` | No change | Returns status (no persistence involved) |

Tauri v2 automatically injects `AppHandle` when a command parameter has type `tauri::AppHandle` — no registration changes needed.

### 4.2 Startup Loading

In `src-tauri/src/lib.rs`, within the `.setup(|app| { ... })` closure:

```rust
if let Ok(data_dir) = app.path().app_local_data_dir() {
    audio_engine::dsp_load_and_apply_persisted(&data_dir);
}
```

`dsp_load_and_apply_persisted` is a new wrapper in `audio_engine/mod.rs`:

```rust
pub fn dsp_load_and_apply_persisted(data_dir: &std::path::Path) {
    let config = dsp::persistence::load_dsp_config(data_dir);
    dsp::set_config(config);
}
```

This calls the internal `dsp::set_config` (not the Tauri command), so it **does not trigger a redundant file save** during startup.

---

## 5. Frontend Integration Plan

### 5.1 Changes Required

**No frontend changes are required for Phase 9B.** Here is why:

- `useAudioDsp()` already calls `get_dsp_config` on mount (`src/lib/use-audio-dsp.ts:72`)
- Since persisted config is loaded into `DspConfigShared` at app startup (before frontend starts), `get_dsp_config` on mount returns the restored state automatically
- The hook already calls `set_dsp_config`, `reset_dsp_config`, and `set_dsp_eq_preset` — all of which will now auto-persist
- Both Engine Lab and Equalizer share the same `AudioDspProvider` context — they stay synchronized

### 5.2 Optional UI Copy (Non-blocking)

If clean and time permits, a subtle text update may be added to `equalizer-view.tsx` or `engine-lab-view.tsx`:

```
"Settings saved locally. Restored on next app start."
```

This is a label addition only, not a new feature. It is **optional** for Phase 9B. Do not add a "Save" button — persistence is automatic.

### 5.3 Files to Inspect (Frontend — no changes expected)

| File | Purpose |
|------|---------|
| `src/lib/use-audio-dsp.ts` | Verify hook calls match updated command signatures |
| `src/components/engine/dsp-controls.tsx` | No changes needed |
| `src/components/engine/engine-lab-view.tsx` | Optional copy update only |
| `src/components/eq/equalizer-view.tsx` | Optional copy update only |

---

## 6. Error Handling Plan

| Scenario | Handling | Impact |
|----------|----------|--------|
| Config file missing (first run) | Return defaults silently | Normal first-run experience |
| Malformed JSON | Return defaults, log warning to stderr | User starts fresh |
| Unknown schema version | Return defaults | User starts fresh |
| App-local data dir unavailable | Skip persistence for the session | Runtime-only mode, no crash |
| Save failure (disk full, permissions) | Log warning (`eprintln!` or `log::warn!`), return Ok to command | Config still applies for session |
| Invalid persisted values (out of range) | `clamp_config()` clamps to safe ranges | Prevents unsafe filter coefficients |
| Temp file rename failure | Return `Err(String)` from `save_dsp_config`, log it | Graceful no-op |

**Invariant:** Persistence failure must never crash the app or break the audio engine. The DSP system operates on atomics regardless of file I/O status.

---

## 7. Tests and Verification Plan

### 7.1 Rust Unit Tests (in persistence.rs)

| Test | What it verifies |
|------|-----------------|
| `missing_config_returns_defaults` | First-run: no file → defaults (enabled=false, limiter=true, eq_preset="flat") |
| `malformed_json_returns_defaults` | Corrupted file → defaults, no crash |
| `save_then_load_roundtrip` | Arbitrary config saved and loaded back identically |
| `invalid_gain_clamped_on_load` | output_gain=999 → clamped to 12.0 |
| `reset_removes_file` | reset deletes the file |
| `save_creates_directory_if_missing` | Creates data dir lazily on first save |
| `unknown_schema_version_falls_back_to_defaults` | schema_version=99 → defaults |

### 7.2 Verification Commands

```bash
# Rust unit tests (persistence + limiter + all existing)
cargo test --manifest-path src-tauri\Cargo.toml

# Rust compile check
cargo check --manifest-path src-tauri\Cargo.toml

# TypeScript type check
npx tsc --noEmit

# Full build
npm run build

# Dev app
npm run tauri dev
```

### 7.3 Manual Smoke Tests

1. Open Audapp in `tauri dev`
2. Go to Equalizer → enable DSP, set output gain +4 dB, select "Gaming" preset
3. Change one EQ band manually (custom mode)
4. Enable high-pass filter
5. Disable limiter
6. Close Audapp
7. Restart `tauri dev`
8. Open Equalizer — confirm: DSP enabled, gain 4 dB, eq_preset "custom", EQ band values retained, high-pass enabled, limiter disabled
9. Click Reset to Flat (or reset button)
10. Close, restart
11. Confirm: DSP disabled, 0 dB, flat EQ, limiter enabled
12. Open Engine Lab → start Render Test Tone → confirm tone plays
13. Change Engine Lab EQ → close → reopen → confirm Engine Lab settings restored
14. Corrupt `engine-lab-dsp-config.json` manually → reopen → confirm no crash, defaults shown
15. Confirm Apps / Devices / Mixer pages are unaffected

---

## 8. Phase 9B Implementation Checklist

Ordered build tasks for Sonnet:

1. [ ] Read this Phase 9A plan and the Phase 9B Sonnet build prompt
2. [ ] Confirm current DSP commands in `audio_engine_commands.rs` match plan
3. [ ] Confirm `useAudioDsp()` hook calls in frontend match plan
4. [ ] Create `src-tauri/src/audio_engine/dsp/persistence.rs` with `PersistedDspConfigFile`, `config_file_path`, `load_dsp_config`, `save_dsp_config`, `reset_persisted_dsp_config`, `clamp_config`
5. [ ] Write unit tests in `persistence.rs` (7 tests, TDD — write tests first)
6. [ ] Run tests: `cargo test --manifest-path src-tauri\Cargo.toml`
7. [ ] Add `pub mod persistence;` to `src-tauri/src/audio_engine/dsp/mod.rs`
8. [ ] Add `dsp_load_and_apply_persisted(data_dir: &Path)` to `src-tauri/src/audio_engine/mod.rs`
9. [ ] Update `set_dsp_config`, `reset_dsp_config`, `set_dsp_eq_preset` in `audio_engine_commands.rs` to add `AppHandle` and call persistence
10. [ ] Add startup load call in `src-tauri/src/lib.rs` setup closure
11. [ ] Run `cargo check --manifest-path src-tauri\Cargo.toml`
12. [ ] Run `cargo test --manifest-path src-tauri\Cargo.toml` (all tests pass)
13. [ ] Run `npx tsc --noEmit` (no type errors)
14. [ ] Run `npm run tauri dev` and perform manual smoke tests
15. [ ] Optionally: add "Saved locally" copy to Equalizer/Engine Lab view
16. [ ] Commit final changes

---

## 9. Risks and Deferrals

### 9.1 Risks

| Risk | Mitigation |
|------|-----------|
| Corrupted JSON | Fallback to defaults on any `serde_json` error |
| App-local data dir permissions | Check `app_local_data_dir()` result, skip persistence if unavailable |
| Config schema drift in future phases | `schema_version` field allows migration/fallback |
| Invalid persisted EQ values → unsafe filter coefficients | `clamp_config()` in `load_dsp_config` |
| Saving too frequently during slider drags | Acceptable: JSON ~300 bytes, writes ~1 ms, 100ms throttle = max 10 saves/sec |
| Race between UI throttled update and app close | Last throttled save fires within 100ms; no data loss risk for most interactions |
| User confusion between Engine Lab EQ and system-wide EQ | Existing UI copy already warns this is Engine Lab only |

### 9.2 Deferrals (Out of Scope for Phase 9B)

- Routing or per-app audio device switching
- System-wide EQ or production output/mic EQ
- Noise suppression
- Virtual audio devices, drivers, APOs
- Exclusive-mode audio
- Cloud sync or user profiles
- Advanced preset editor
- Export/import settings (JSON backup)
- Persistence of engine running/stopped state
- Persistence of test tone frequency/gain
- Persistence of selected output/input device IDs
- Auto-start audio engine on app launch
