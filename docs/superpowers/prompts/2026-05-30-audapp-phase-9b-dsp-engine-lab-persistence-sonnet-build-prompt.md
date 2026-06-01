# Audapp — Phase 9B DSP Engine Lab Persistence Implementation

## Target Thread
Audapp — Phase 9B DSP Engine Lab Persistence Implementation

## Target Agent
Claude Code

## Suggested Model / Effort
Claude Sonnet 4.6 — High effort

## Mode
Build mode

## Suggested Skills
- `executing-plans`
- `tauri-app-architecture`
- `rust`
- `real-time-audio`
- `frontend-integration`
- `debugging`

## Project Name
Audapp

## Project Path
```
C:\Users\mustafa\Audapp
```

---

## Build Prompt

You are implementing **Phase 9B** of Audapp: **local JSON persistence for Engine Lab / Equalizer DSP settings**.

### Read These First

Before writing any code, read:

1. `C:\Users\mustafa\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-9a-dsp-engine-lab-persistence-plan.md` — the full Phase 9A planning document (architecture, schema, command contract, tests, smoke test checklist)
2. `C:\Users\mustafa\.claude\plans\audapp-phase-fluttering-meerkat.md` — the detailed implementation plan with exact code for each task

Then inspect the current repo state to confirm the plan matches reality before implementing.

---

## Project Context

Audapp is a Windows desktop audio control app built with:
- **Rust** + **Tauri v2**
- **React** + **TypeScript** + **shadcn/ui** + **Tailwind CSS**
- **WASAPI** via `windows-rs`

Current state (post-hotfix):
- WASAPI Engine Lab with real DSP/EQ pipeline
- 5-band peaking EQ (100, 250, 1k, 4k, 10k Hz, ±12 dB)
- EQ presets: Flat, Gaming, Music, Voice Clarity, Bass Boost
- Output soft-clip limiter
- High-pass / low-pass filters
- Both Equalizer page and Engine Lab share the same DSP config via `useAudioDsp()` hook / `AudioDspProvider`
- DSP settings are currently **in-memory only** — not persisted across restarts

---

## What to Implement

Add local JSON persistence for Engine Lab / Equalizer DSP settings so they survive app restarts.

### Files to Create

**New file:** `src-tauri/src/audio_engine/dsp/persistence.rs`

Implement:
```rust
pub struct PersistedDspConfigFile {
    pub schema_version: u32,  // = 1
    pub saved_at: String,     // RFC3339
    pub dsp: DspRuntimeConfig,
}

pub fn config_file_path(data_dir: &Path) -> PathBuf
pub fn load_dsp_config(data_dir: &Path) -> DspRuntimeConfig  // defaults on any error
pub fn save_dsp_config(data_dir: &Path, config: &DspRuntimeConfig) -> Result<(), String>  // atomic write
pub fn reset_persisted_dsp_config(data_dir: &Path) -> Result<(), String>  // delete file
fn clamp_config(config: DspRuntimeConfig) -> DspRuntimeConfig  // defensive clamping
```

**Persistence file location:** `<AppLocalDataDir>\engine-lab-dsp-config.json`

**Atomic write pattern** (mirror `src-tauri/src/audio/assignments.rs`):
```rust
// Write to .tmp file, then rename
let tmp_path = path.with_extension("tmp");
fs::write(&tmp_path, json)?;
fs::rename(&tmp_path, &path)?;
```

**Clamping on load:**
```rust
config.output_gain_db = config.output_gain_db.clamp(-24.0, 12.0);
config.input_gain_db = config.input_gain_db.clamp(-24.0, 12.0);
config.high_pass_hz = config.high_pass_hz.clamp(20.0, 300.0);
config.low_pass_hz = config.low_pass_hz.clamp(4000.0, 20000.0);
for band in &mut config.eq_bands { band.gain_db = band.gain_db.clamp(-12.0, 12.0); }
```

### Files to Modify

**`src-tauri/src/audio_engine/dsp/mod.rs`**
- Add: `pub mod persistence;`

**`src-tauri/src/audio_engine/mod.rs`**
- Add startup helper:
```rust
pub fn dsp_load_and_apply_persisted(data_dir: &std::path::Path) {
    let config = dsp::persistence::load_dsp_config(data_dir);
    dsp::set_config(config);
}
```

**`src-tauri/src/audio_engine_commands.rs`**

Add `app: tauri::AppHandle` to three commands (Tauri v2 injects it automatically by type):

```rust
pub fn set_dsp_config(app: tauri::AppHandle, config: DspRuntimeConfig) -> DspRuntimeStatus {
    let status = audio_engine::dsp_set_config(config.clone());
    if let Ok(data_dir) = app.path().app_local_data_dir() {
        let _ = audio_engine::dsp::persistence::save_dsp_config(&data_dir, &config);
    }
    status
}

pub fn reset_dsp_config(app: tauri::AppHandle) -> DspRuntimeConfig {
    let config = audio_engine::dsp_reset_config();
    if let Ok(data_dir) = app.path().app_local_data_dir() {
        let _ = audio_engine::dsp::persistence::reset_persisted_dsp_config(&data_dir);
    }
    config
}

pub fn set_dsp_eq_preset(app: tauri::AppHandle, preset: String) -> DspRuntimeStatus {
    let status = audio_engine::dsp_set_eq_preset(preset);
    if let Ok(data_dir) = app.path().app_local_data_dir() {
        let current = audio_engine::dsp_get_config();
        let _ = audio_engine::dsp::persistence::save_dsp_config(&data_dir, &current);
    }
    status
}
```

**`src-tauri/src/lib.rs`**

In the `.setup(|app| { ... })` closure, add:
```rust
if let Ok(data_dir) = app.path().app_local_data_dir() {
    audio_engine::dsp_load_and_apply_persisted(&data_dir);
}
```

This loads persisted config before any frontend command is processed.

---

## Strict Scope Boundary

### Allowed in this phase

- Local JSON persistence for Engine Lab DSP/EQ settings
- Atomic save (temp + rename)
- Load on startup with graceful defaults
- Reset behavior (delete or overwrite file)
- Value clamping on load
- Schema version check
- Unit tests for persistence (7 tests)
- Optional: add "Saved locally" label to Equalizer or Engine Lab view (UI copy only, no new features)

### NOT allowed in this phase

Do **not** implement any of:
- Audio routing of any kind
- System-wide EQ
- Production output or mic EQ
- Noise suppression
- Per-app output device switching
- Virtual audio devices, drivers, APOs
- Exclusive-mode audio
- Cloud sync, user profiles
- Database storage
- Major UI redesign
- Auto-start audio engine on app launch
- Persistence of engine running/stopped state
- Persistence of test tone frequency/gain or selected device IDs

---

## Required Tests

Write these 7 unit tests in `persistence.rs` using TDD (write tests before implementation):

1. `missing_config_returns_defaults` — no file → enabled=false, limiter=true, eq_preset="flat"
2. `malformed_json_returns_defaults` — corrupted file → defaults, no panic
3. `save_then_load_roundtrip` — write custom config, read it back identically
4. `invalid_gain_clamped_on_load` — output_gain_db=999 in file → loaded as 12.0
5. `reset_removes_file` — reset_persisted_dsp_config deletes the file
6. `save_creates_directory_if_missing` — save to non-existent directory → creates it
7. `unknown_schema_version_falls_back_to_defaults` — schema_version=99 → defaults

Use `std::env::temp_dir()` with a unique subdirectory for file I/O in tests. Clean up after each test.

---

## Existing Patterns to Reuse

| Pattern | Location |
|---------|----------|
| Atomic write (temp + rename) | `src-tauri/src/audio/assignments.rs` |
| `app_local_data_dir()` access | `src-tauri/src/commands.rs` (channel assignments) |
| `serde_json::to_string_pretty()` | `src-tauri/src/audio/assignments.rs:71` |
| `DspRuntimeConfig::default()` | `src-tauri/src/audio_engine/dsp/types.rs` |
| `chrono::Utc::now().to_rfc3339()` | Already used in dsp/config.rs for timestamps |

---

## Verification Commands

Run all of these before reporting complete:

```bash
# All Rust tests (persistence tests + existing limiter/eq tests)
cargo test --manifest-path src-tauri\Cargo.toml

# Rust compile check
cargo check --manifest-path src-tauri\Cargo.toml

# TypeScript type check
npx tsc --noEmit

# Start dev app
npm run tauri dev
```

---

## Manual Smoke Tests

Perform these after `npm run tauri dev` succeeds:

1. Open Equalizer page → enable DSP → set output gain to +4 dB → select "Gaming" preset → edit one EQ band manually → enable high-pass filter → disable limiter
2. Close Audapp completely (quit the dev window)
3. Restart `npm run tauri dev`
4. Open Equalizer — **confirm all settings are restored**
5. Click Reset to Flat (or reset button) → close → restart → **confirm defaults are shown**
6. Open Engine Lab → start Render Test Tone → **confirm test tone plays**
7. Corrupt `engine-lab-dsp-config.json` manually → restart → **confirm no crash, defaults shown**
8. Check Apps, Devices, Mixer pages → **confirm unaffected**

---

## Acceptance Criteria

The phase is complete when all of the following are true:

- [ ] Project builds successfully (`cargo check` + `npm run build`)
- [ ] Tauri dev app starts without errors
- [ ] DSP enabled/disabled state persists after restart
- [ ] Output gain value persists after restart
- [ ] Limiter enabled state persists after restart
- [ ] EQ enabled state persists after restart
- [ ] EQ preset selection persists after restart
- [ ] Custom EQ band gain values persist after restart
- [ ] High-pass filter enabled/hz persists after restart
- [ ] Reset/default behavior works: after reset, restart shows defaults
- [ ] Corrupted or missing config file does not crash the app
- [ ] Engine Lab test tone still works after restart with persisted settings
- [ ] Equalizer page still controls real Engine Lab DSP config
- [ ] Both Equalizer and Engine Lab are synchronized (same config)
- [ ] No routing, system-wide EQ, noise suppression, driver, or APO code is added
- [ ] All 7 Rust persistence unit tests pass
- [ ] TypeScript type check passes (no new type errors)

---

## Required Final Report

When complete, report:

1. **What was implemented** — list the files created/modified and what each does
2. **Files changed** — exact paths
3. **Persistence file location** — the resolved path on Windows (e.g., `%LOCALAPPDATA%\com.audapp.app\engine-lab-dsp-config.json`)
4. **How load/save/reset works** — brief description of the lifecycle
5. **How to run/test** — commands to verify the implementation
6. **Test results** — output of `cargo test`
7. **What is real vs still lab-only** — clarify that DSP only affects Engine Lab test audio, not system audio
8. **Known limitations** — any edge cases or deferred work
9. **Recommended next phase** — what would be Phase 10

---

## Very Short Summary

This prompt asks Sonnet to implement Phase 9B of Audapp: local JSON persistence for Engine Lab / Equalizer DSP settings. The implementation adds a new `persistence.rs` module with atomic save/load/reset, wires persistence into three existing Tauri DSP commands by adding `AppHandle`, and loads persisted config at app startup — all without any frontend changes or changes to the audio routing scope.
