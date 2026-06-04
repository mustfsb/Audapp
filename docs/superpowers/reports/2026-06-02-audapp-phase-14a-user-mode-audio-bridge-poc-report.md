# Audapp Phase 14A — User-Mode Audio Bridge POC Report

**Date:** 2026-06-02  
**Branch:** codex/phase-12h-driver-binding-fix-docs  
**Phase:** 14A — User-Mode Audio Bridge POC

---

## 1. Phase 12/13A Starting State

```
FriendlyName : Audapp Input
Status       : OK
Class        : MEDIA
ProblemCode  : 0
DriverInfPath: oem19.inf
```

**Phase 12/13A state is intact. No regression.**

---

## 2. Endpoints Found (Phase 13A known)

| Endpoint | Friendly Name | ID |
|----------|---------------|----|
| Render | Hoparlör (Audapp Input) | `{0.0.0.00000000}.{6dee1be1-f344-45e4-aa77-2fb20caac6b9}` |
| Capture | Mikrofon (Audapp Input) | `{0.0.1.00000000}.{84bbfd53-05f2-4232-b20b-f8c4237c18d6}` |

The Bridge Lab hardcodes these IDs (from Phase 13A) and passes them to `bridge_start()`. They can also be discovered dynamically by name ("audapp" keyword search) if the config omits the IDs.

---

## 3. Implementation Summary

### Rust: `src-tauri/src/audio_bridge/`

A new Rust module following the same `OnceLock<Mutex<Manager>> + worker thread` pattern as `audio_engine/routing/`.

**`types.rs`** — Defines:
- `BridgePocConfig` — deserialized from Tauri command input
- `BridgePocStatus` — serialized status returned to frontend
- `StreamStats`, `OutputStats`, `BridgeState`

**`worker.rs`** — Single worker thread with three independent streams:

1. **Render loopback capture** — Opens Audapp Input render endpoint (`eRender`) with `AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000`. This taps the Windows audio engine's mixed output for that endpoint without requiring a dummy render client. `GetService::<IAudioCaptureClient>()` is called to read packets.

2. **Capture endpoint read** — Opens Audapp Input capture endpoint (`eCapture`) as a normal WASAPI shared-mode capture client. `GetService::<IAudioCaptureClient>()` reads packets from what the driver emits.

3. **Physical monitor output** (optional) — Finds a non-Audapp render endpoint (or uses the specified ID), initializes as a shared-mode render client, and writes loopback audio to it. Channel conversion (stereo↔mono) is handled. If sample rates differ, monitor is disabled and an error is reported.

The main poll loop:
- Sleeps 10ms per iteration
- Reads all available packets from each capture client per iteration
- Computes per-stream peak and RMS (f64 accumulation, cast to f32)
- Accumulates loopback frames in a bounded Vec (max 88200 samples ≈ 1s of stereo 44100Hz)
- Writes accumulated frames to monitor render client if enabled
- Updates shared status every 50 iterations (~500ms)

**`manager.rs`** — Global OnceLock manager:
- `bridge_start(config)` → spawns worker thread, returns `BridgePocStatus`
- `bridge_stop()` → sets stop flag, joins thread, returns final status
- `bridge_status()` → clones shared status
- `bridge_shutdown()` → called on window destroy, waits up to 2 seconds for thread

**`mod.rs`** — Re-exports public API.

**`src-tauri/src/bridge_commands.rs`** — Three Tauri commands:
- `start_audio_bridge_poc(config)`
- `stop_audio_bridge_poc()`
- `get_audio_bridge_status()`

### Frontend

**`src/types/bridge.ts`** — TypeScript types matching Rust structs.

**`src/lib/use-audio-bridge.ts`** — React hook with 2-second polling while running.

**`src/components/bridge/bridge-lab-view.tsx`** — UI panel with:
- Audapp endpoint IDs (hardcoded from Phase 13A)
- Config toggles: enable loopback, enable capture read, enable monitor output
- Start/Stop/Refresh buttons
- Runtime state badge
- Per-stream: initialize_ok, start_ok, packets_read, frames_read, peak/RMS bars
- Monitor output: device ID, init/start status, frames written, underruns

**`src/types/audio.ts`** — Added `"bridge"` to `SectionId`.

**`src/app/App.tsx`** — Added Bridge Lab to navigation and content map.

**`src/components/layout/sidebar.tsx`** — Added `Cable` icon for Bridge Lab.

---

## 4. Files Changed

| File | Change |
|------|--------|
| `src-tauri/src/audio_bridge/mod.rs` | **New** |
| `src-tauri/src/audio_bridge/types.rs` | **New** |
| `src-tauri/src/audio_bridge/worker.rs` | **New** — 460 lines |
| `src-tauri/src/audio_bridge/manager.rs` | **New** |
| `src-tauri/src/bridge_commands.rs` | **New** |
| `src-tauri/src/lib.rs` | Added `mod audio_bridge`, `mod bridge_commands`, registered commands, added `bridge_shutdown()` to window destroy handler |
| `src/types/audio.ts` | Added `"bridge"` to `SectionId` |
| `src/types/bridge.ts` | **New** |
| `src/lib/use-audio-bridge.ts` | **New** |
| `src/components/bridge/bridge-lab-view.tsx` | **New** |
| `src/app/App.tsx` | Added Bridge Lab to navigation and content |
| `src/components/layout/sidebar.tsx` | Added `Cable` icon for bridge section |

No driver files, no INF files, no device creation scripts, no boot settings were touched.

---

## 5. Build / Check Results

```
cargo check --manifest-path src-tauri\Cargo.toml
→ 0 errors, 24 pre-existing warnings (unchanged)
→ Finished dev profile in 3.69s

npm run build
→ ✓ 1906 modules transformed. ✓ built in 4.41s
```

---

## 6. Runtime Behavior (Design)

### What the Bridge POC tests

**Render loopback capture** (`AUDCLNT_STREAMFLAGS_LOOPBACK`):

This is a read-only tap on the Windows audio engine's mix bus for the Audapp Input render endpoint. It requires no dummy render client. As long as any application is routing audio to Hoparlör (Audapp Input), the loopback capture client receives those mixed frames. If no app sends audio, the loopback receives silence.

Expected results when audio is playing:
- `render_loopback.packets_read` increments
- `render_loopback.frames_read` increments
- `render_loopback.peak > 0.0`
- `render_loopback.rms > 0.0`

Expected results with no audio:
- `packets_read` increments (WASAPI may still deliver silent packets)
- `peak ≈ 0.0`, `rms ≈ 0.0`

**Capture endpoint read** (Mikrofon / Audapp Input):

The ACX driver exposes a capture pin. The WASAPI capture client can open it. Whether frames contain audio depends on whether the driver performs any render→capture loopback internally (driver-side bridge). Without a driver-side bridge, the capture endpoint likely emits silence.

Expected results:
- `capture_read.packets_read` increments (WASAPI delivers silent packets)
- `peak ≈ 0.0` unless driver has internal render→capture routing

**Monitor output**:

Routes loopback audio to a physical speaker. Disabled by default (toggle in UI). Enabling it while Audapp Input is the system default creates a loopback chain: App → Audapp render → loopback → physical speaker.

---

## 7. WASAPI Technical Notes

### Loopback capture flag

`AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000` is passed as the `StreamFlags` parameter to `IAudioClient::Initialize`. This is a well-documented Windows feature that allows user-mode applications to capture the post-mix output of any render endpoint.

Key invariant: loopback capture only captures audio that the Windows Audio Engine is actively mixing for that endpoint. If no render client has audio in the mix, loopback captures silence.

### User-mode cannot push audio into a capture endpoint

WASAPI roles are fixed:
- A **render** endpoint receives audio via `IAudioRenderClient::GetBuffer` → write → `ReleaseBuffer`
- A **capture** endpoint emits audio via `IAudioCaptureClient::GetBuffer` → read → `ReleaseBuffer`

There is no WASAPI API to write audio into a capture endpoint from user space. If a true virtual cable (render audio appears on capture) is required, it must be implemented inside the driver (ACX render→capture buffer plumbing). The POC does not fake this.

---

## 8. Outcome Classification

This report documents the implementation. The runtime outcome will be classified after running the POC:

| Outcome | Condition | Implication |
|---------|-----------|-------------|
| A | Loopback counters increment with audio → Capture endpoint emits silence | Driver-side buffer plumbing needed for render→capture bridge |
| B | Both streams increment | Driver already has render→capture routing |
| C | Loopback works but Initialize fails for capture | Driver capture pin issue |
| D | Neither stream delivers audio packets | No audio being rendered, or driver issue |
| E | Initialize fails for loopback | WASAPI loopback flag not supported on virtual endpoint |

---

## 9. CPU / Stability Notes

- Worker thread sleeps 10ms per iteration; no busy spin
- Loopback buffer is bounded at 88200 f32 samples (~1 second stereo 44100Hz = 352KB)
- Buffer is cleared if no monitor output is consuming it to prevent unbounded growth
- Peak/RMS computed in f64 to avoid float accumulation errors over long runs
- Status update every 50 iterations (~500ms) to keep Mutex lock frequency low
- Thread join on stop: `bridge_stop()` blocks until worker exits cleanly
- `bridge_shutdown()` waits up to 2 seconds then abandons (prevents hang on app close)

---

## 10. Limitations

1. **Runtime results not yet recorded** — Phase 14A must be run interactively via `npm run tauri dev` and the Bridge Lab page.
2. **Monitor output default device selection** — If Audapp Input is the system default render, `find_non_audapp_default` falls back to enumerating other active render endpoints. This may pick any physical device; the UI doesn't let the user select it. A future phase can add a device selector.
3. **No resampler** — Monitor output is disabled if its sample rate differs from the loopback rate (44100Hz).
4. **Capture endpoint likely emits silence** — Without driver-side render→capture buffer plumbing, the ACX capture pin has no audio source. This is documented behavior and does not represent a bug.
5. **Endpoint IDs are hardcoded** — The Bridge Lab UI uses the Phase 13A-discovered endpoint IDs. If the driver is reinstalled and endpoint GUIDs change, the IDs must be updated.

---

## 11. Exact Next Task — Phase 14B

**Phase 14B: Bridge Lab Runtime Verification**

1. Run `npm run tauri dev`
2. Navigate to Bridge Lab page
3. Start POC with loopback + capture enabled
4. Play audio to any app while Audapp Input is system default render device
5. Record:
   - `renderLoopback.packetsRead`, `framesRead`, `peak`, `rms` with audio playing
   - `renderLoopback.packetsRead`, `framesRead`, `peak`, `rms` with no audio
   - `captureRead.packetsRead`, `framesRead`, `peak`, `rms`
   - Any errors reported
6. Classify outcome (A through E from Section 8)
7. If Outcome A or B confirmed: proceed to Phase 15 (driver-side render→capture buffer plumbing or bridge service architecture)

---

## Summary

| Item | Result |
|------|--------|
| Phase 12/13A state healthy? | YES — Status OK, ProblemCode 0, oem19.inf |
| Bridge POC implemented? | YES |
| Rust: `cargo check` | 0 errors |
| Frontend: `npm run build` | 0 errors, 1906 modules |
| Loopback flag used | `AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000` |
| Capture endpoint read | Standard WASAPI shared-mode capture |
| Monitor output | Enabled by toggle; stereo/mono conversion handled |
| Commits? | None (per safety boundary) |
