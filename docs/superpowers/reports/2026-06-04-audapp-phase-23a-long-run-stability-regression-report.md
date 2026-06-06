# Phase 23A — Long-Run Stability / Latency / Regression Validation Report

**Date:** 2026-06-04  
**Branch:** `main`  
**Commit:** `e4ce1e1` — checkpoint: restore Audapp routing, mixer, DSP, and voice lab  
**Model:** Claude Sonnet 4.6  

---

## 1. Driver Preflight

| Check | Result |
|---|---|
| Device | `ROOT\DEVGEN\AUDAPP12G0001` — Audapp Input |
| Status | **OK** (Driver is running) |
| ProblemCode | **0** (no error) |
| ProblemStatus | Empty (no problem status) |
| Class | **MEDIA** |
| Controlling service | **AudioCodec** |
| DriverInfPath | **oem19.inf** |
| Stack upper filter | `ksthunk` |

**Result: PASS.** Driver state exactly matches expected Phase 22 baseline. No regression detected.

---

## 2. Build / Test Results

### cargo check

```
audapp (lib) — 28 warnings, 0 errors
  Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.45s
```

Warnings are all `dead_code` / `unused_import` for scaffolded functions and stub variants. No regressions from prior checkpoints. No `error[E...]` entries.

**Result: PASS**

### npm run build (tsc + vite)

```
vite v7.3.3 building client environment for production...
✓ 1918 modules transformed
dist/index.html                 0.41 kB │ gzip:   0.27 kB
dist/assets/index-C4upMjf5.css 69.15 kB │ gzip:  11.23 kB
dist/assets/index-Cy_WpyJt.js 462.73 kB │ gzip: 136.91 kB
✓ built in 4.00s
```

tsc passes (no TypeScript errors). Vite bundles successfully.

**Result: PASS**

### Unit tests — node --test

```
✔ 23/23 tests PASS
  channel-workflow.test.ts   — 11 pass
  session-route-status.test.ts — 4 pass
  solo-resolver.test.ts      — 8 pass
duration_ms: 339
```

All 23 tests pass covering: channel assignment workflow, manual vs. rule preference, smart defaults, route intent/support status, solo resolver (single/multi/all solo, mutedBySolo logic, toggleSoloInSet).

**Result: PASS**

---

## 3. Code Inspection — Bridge / Routing

**Files reviewed:** `audio_policy/manager.rs`, `audio_policy/default_endpoint.rs`, `audio_bridge/manager.rs`, `audio_bridge/worker.rs`, `src/lib/use-audio-bridge.ts`

**Findings:**

- Manager pattern is consistent and sound: `OnceLock<Mutex<...>>` singleton, `AtomicBool` stop/done flags, `Arc<Mutex<...>>` shared status.
- `bridge_stop()` correctly joins the thread before returning status, preventing stale state.
- `bridge_shutdown()` (called on app exit) uses a 2-second deadline loop, preventing hang-on-close.
- Frontend `useAudioBridge` polls at 2000ms and self-stops polling when state leaves `running`/`starting`.
- `routing_enable()` correctly guards against Audapp-to-Audapp routing loop.
- `routing_enable()` holds `RoutingState` Mutex across `with_com()` — acceptable in single-threaded Tauri command context, not a deadlock risk.

**Known design limitation (documented in code):** If `bridge_start()` fails after the Windows default endpoint has already been changed to Audapp Input, `routing_enable()` reports `enabled=true` but audio will be silent until a stop+start cycle. The `last_error` field surfaces this to the UI.

**Result: No bugs found.**

---

## 4. Code Inspection — DSP

**Files reviewed:** `audio_engine_commands.rs`, `audio_engine/dsp/pipeline.rs`, `audio_engine/dsp/persistence.rs`, `audio_engine/dsp/presets.rs`

**Findings:**

- `set_dsp_config` and `set_dsp_eq_preset` both persist to `app_local_data_dir` after applying live.
- `reset_dsp_config` clears persisted file correctly.
- `dsp_set_eq_preset` reads current config after applying preset then saves — correct (avoids saving stale config).
- 28 cargo warnings include `EQ_GAIN_MAX_DB`/`EQ_GAIN_MIN_DB` unused in `presets.rs` — these are constants in the presets module that aren't currently used to validate user input. Not a runtime bug.

**Result: No bugs found.**

---

## 5. Code Inspection — Mixer / Channel Controls

**Files reviewed:** `src/lib/use-mixer-channel-settings.ts`, `src/lib/solo-resolver.ts`, `src/lib/use-channel-assignments.ts`

**Findings:**

- `persistChannelSetting` correctly updates local state optimistically after confirmed server-side save.
- `applyToChannels` merges saved volume/mute onto discovery channels — `peak` and `meterHold` use simple `volumePercent ± 6/12` approximations (noted: these are UI-only estimates, not real signal levels).
- Solo resolver is pure (no side effects), all 8 unit test cases pass including edge cases (solo all → none muted).

**Result: No bugs found.**

---

## 6. Code Inspection — Channel Rules / Persistence

**Files reviewed:** `src/lib/use-channel-rules.ts`, `src/lib/channel-rules.ts`

**Findings:**

- Rules are persisted to `localStorage` on every mutation (add/update/remove) via `writeStoredChannelRules`.
- `removeRule` filters by `ruleId` — delete is clean, no stale re-appearance.
- `mutateRules` uses a functional state updater to avoid stale closure captures.
- Storage errors are caught and surfaced via `error` state, not silently dropped.

**Result: No bugs found.**

---

## 7. Code Inspection — Voice Lab

**Files reviewed:** `voice_lab/manager.rs`, `voice_lab/worker.rs`, `src/lib/use-voice-lab.ts`

**Findings:**

- Voice Lab manager mirrors Bridge manager pattern — consistent, no deadlock risk.
- `voice_shutdown()` uses a 2-second deadline loop (same as bridge) — clean app exit.
- `voice_set_settings()` pushes settings into `shared_settings` Arc while worker is running — worker reads on each loop iteration, no restart needed.
- Frontend `useVoiceLab` polls at 300ms (faster than bridge's 2000ms — appropriate for meter updates).
- Settings persist to `localStorage` key `audapp.voiceLab.settings.v1` — survives app restart.
- `loadDevices()` catches individual errors per device type (inputs/outputs) so a missing input device doesn't block output device load.

**Result: No bugs found.**

---

## 8. Interactive Smoke Test

**Note:** Interactive Tauri GUI smoke tests require a running display session and cannot be executed by the automated validation agent. The following section is a **to-do checklist** for the user to complete manually by running `npm run tauri dev`.

### 8.1 Bridge / Routing Smoke Test (User)

```
[ ] Open Bridge Lab
[ ] Select physical output
[ ] Enable Audapp Routing
[ ] Play audio — confirm audible
[ ] Confirm framesRead / packetsRead increment in counters
[ ] Confirm underruns / droppedFrames are low or zero
[ ] Disable routing — confirm Windows output restores
[ ] Repeat enable/disable x2
[ ] Report: did routing stick? Any stale state after 3 cycles?
```

### 8.2 Master DSP Smoke Test (User)

```
[ ] Enable DSP
[ ] Set master gain to -20dB — confirm quieter
[ ] Return to 0dB
[ ] Toggle master mute — confirm silence without stopping bridge
[ ] Apply Flat / Bass Boost / Voice preset
[ ] Confirm no crash
```

### 8.3 Mixer Channels Smoke Test (User)

```
[ ] Assign active app session to Audapp Music
[ ] Confirm session appears in Mixer
[ ] Test volume slider
[ ] Test mute
[ ] Test solo — confirm other channels dim
[ ] Confirm route intent "unsupported" copy still present for audapp/bypass
```

### 8.4 Channel Rules Smoke Test (User)

```
[ ] Open Advanced Channel Rules
[ ] Confirm panel is collapsed / secondary (not a giant top panel)
[ ] Add rule: process contains "msedge" -> Audapp Music
[ ] Confirm source label changes
[ ] Delete rule
[ ] Confirm empty state / no reappearance
```

### 8.5 Voice Lab Smoke Test (User)

```
[ ] Select physical input
[ ] Start capture
[ ] Confirm raw / processed meters move
[ ] Toggle noise gate / gain / limiter — confirm meter behavior changes
[ ] Stop capture
[ ] Start/stop once more
[ ] Report: any hang / error after 2 cycles?
```

### 8.6 Short Long-Run (User)

```
[ ] Keep Bridge + DSP active for 10–15 minutes
[ ] Observe audible stability and counter behavior
[ ] Record: underruns, droppedFrames, discontinuities, postDspPeak, postDspRms
[ ] Extend toward 30 minutes if stable
```

---

## 9. Bugs Found

None found by static analysis and automated test run.

---

## 10. Fixes Applied

None. No bugs warranted a fix in this pass.

---

## 11. Known Limitations

| # | Limitation | Impact | Mitigation |
|---|---|---|---|
| 1 | If `bridge_start()` fails after endpoint switch, routing reports `enabled` but audio is silent | Medium — confusing UX | `last_error` field is populated; user should Stop and re-Enable |
| 2 | VM audio environment introduces WASAPI jitter and potential discontinuities | Low — environmental | Document as VM limitation; counters still track correctly |
| 3 | Mixer `peak`/`meterHold` in `applyToChannels` are UI approximations, not real signal levels | Low — cosmetic | Only relevant until real-time meter forwarding from engine is implemented |
| 4 | 28 cargo `dead_code`/`unused_import` warnings | Low — scaffolding | Harmless; clean up in a future housekeeping pass |
| 5 | Route intent `audapp`/`bypass` correctly shows "unsupported" (no safe per-app API) — Phase 19B honest fallback | Low — known design | Accurate; Phase 21 driver multi-endpoint work is the resolution path |
| 6 | Interactive GUI smoke tests not executed by automated agent | Moderate — requires user | User must run `npm run tauri dev` and follow §8 checklist |

---

## 12. Recommendation

**PROCEED to Phase 21 / driver multi-endpoint work — with the interactive smoke test gate.**

Automated validation results:

| Check | Status |
|---|---|
| Driver preflight | **PASS** — ProblemCode 0, running |
| cargo check | **PASS** — 0 errors |
| npm build | **PASS** — 0 TS errors, clean bundle |
| Unit tests | **PASS** — 23/23 |
| Code inspection: bridge | **PASS** — no bugs |
| Code inspection: DSP | **PASS** — no bugs |
| Code inspection: mixer | **PASS** — no bugs |
| Code inspection: channel rules | **PASS** — no bugs |
| Code inspection: voice lab | **PASS** — no bugs |
| Interactive GUI smoke | **PENDING** — user must complete §8 checklist |

**Gate:** Before starting Phase 21 driver work, the user should complete the §8 interactive smoke test checklist and confirm:
- Bridge routing enable/disable x3 is stable
- No app crash in a 10-minute bridge run
- Voice Lab start/stop x2 without hang

If the §8 checklist passes, the system is confirmed stable for the next driver phase. If issues are found, document them and fix before proceeding.
