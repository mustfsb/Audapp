# Audapp Phase 20C — Voice / Noise Processing Lab Report

**Date:** 2026-06-04  
**Branch:** main (dirty working tree, no commit)  
**Phase:** 20C — Voice / Noise Processing Lab POC

---

## 1. Driver Preflight

```
ROOT\DEVGEN\AUDAPP12G0001
    Name: Audapp Input
    Driver is running.
    1 matching device(s) found.

FriendlyName : Audapp Input
Status       : OK
Class        : MEDIA
InstanceId   : ROOT\DEVGEN\AUDAPP12G0001
ProblemCode  : 0
DriverInfPath: oem19.inf
```

Driver state: **healthy**. No regression.

---

## 2. Implementation Summary

Phase 20C adds a user-mode **Voice / Noise Processing Lab** to Audapp. The lab captures a physical microphone/input via WASAPI, applies a real-time processing chain, shows raw and processed meters, and optionally monitors processed audio to a physical speaker output.

No driver source was modified. No root device or devgen/devcon work was done. No fake virtual microphone output was implemented.

---

## 3. Input Capture

- Uses WASAPI shared-mode capture (`AUDCLNT_SHAREMODE_SHARED`, no loopback flag)
- Opens the user-selected physical capture device by endpoint ID, or the default capture device if none is selected
- Supports **float32** (primary) and **int16 PCM** (common fallback) capture formats
- Non-float/non-int16 formats are rejected with a clear error message
- Handles `AUDCLNT_BUFFERFLAGS_SILENT` packets (treated as silence, not dropped)

---

## 4. Processing Chain Implemented

The `VoiceChain` struct in `src-tauri/src/voice_lab/processing.rs` provides a stateful, allocation-free real-time processing chain:

| Stage | Details |
|-------|---------|
| Input gain | Linear gain from `input_gain_db` (-24 to +24 dB) |
| High-pass filter | RBJ-cookbook biquad HPF, per channel, configurable cutoff (default 80 Hz) |
| Noise gate | Envelope follower (~1 ms attack, configurable release), binary gate at threshold |
| Limiter | Soft-clip limiter from existing `audio_engine::dsp::limiter::soft_limit` |

Compressor was skipped per plan ("skip it and document") — the gate + limiter combination handles the primary use cases.

Settings are live-updatable while running via `Arc<Mutex<VoiceLabSettings>>` — the worker re-reads them every 50 poll iterations (~250 ms).

---

## 5. Monitor Output Support

Implemented. When `monitor_enabled = true`:
- Opens the user-selected physical render endpoint in WASAPI shared mode
- Processes captured samples through the chain, then buffers them in a bounded ring buffer
- Uses `GetCurrentPadding` / available frames to write without overrunning the render buffer
- Handles channel count mismatch (mono↔stereo) via `mix_channels`
- Handles sample rate mismatch via `LinearResampler` (reused from `audio_bridge::resampler`)
- Excludes Audapp virtual endpoints from the monitor output device list
- Feedback warning is shown in the UI

The monitor path uses the same bounded-buffer / primed-silence pattern from Phase 16B.

---

## 6. UI Changes

`src/components/noise/noise-view.tsx` was rewritten as a self-contained **Voice Lab** component:

- Input device selector (radio list from `voice_list_input_devices`)
- Start / Stop buttons with state badge (stopped / starting / running / stopping / error)
- Raw peak + RMS meters (visible when running)
- Processed peak + RMS meters (visible when running)
- Gate open/closed badge (visible when gate enabled and running)
- Input gain slider (−24 to +24 dB)
- High-pass filter toggle + cutoff slider (40–400 Hz)
- Noise gate toggle + threshold slider (−70 to −10 dB) + release slider (10–500 ms)
- Limiter toggle
- Monitor output card with toggle, device selector, and headphone warning
- Status display (input format, monitor format, last error)
- Honest callout: "This captures and processes mic audio locally. Processed virtual microphone output to apps (Discord, Teams, Zoom) is pending future work."

Settings are persisted to `localStorage` under key `audapp.voiceLab.settings.v1`. Device IDs are remembered but gracefully handled if the device is missing.

---

## 7. Files Changed / Added

### New Rust files
- `src-tauri/src/voice_lab/mod.rs`
- `src-tauri/src/voice_lab/types.rs` — `VoiceDevice`, `VoiceLabSettings`, `VoiceLabState`, `VoiceLabStatus`
- `src-tauri/src/voice_lab/processing.rs` — `VoiceChain` struct
- `src-tauri/src/voice_lab/worker.rs` — WASAPI capture worker + device listing helpers
- `src-tauri/src/voice_lab/manager.rs` — static singleton manager
- `src-tauri/src/voice_lab_commands.rs` — 6 Tauri commands

### Modified Rust files
- `src-tauri/src/lib.rs` — added `mod voice_lab`, `mod voice_lab_commands`, 6 commands in `invoke_handler`, `voice_shutdown()` in window destroy handler
- `src-tauri/src/audio_bridge/mod.rs` — made `resampler` module public (needed by voice_lab worker)

### New TypeScript files
- `src/types/voice-lab.ts` — TS types + defaults
- `src/lib/use-voice-lab.ts` — React hook with polling, settings persistence, device loading

### Modified TypeScript files
- `src/components/noise/noise-view.tsx` — completely rewritten as self-contained Voice Lab
- `src/app/App.tsx` — removed unused `noiseSuppression` state, simplified `noise` section to `<NoiseView />`

### New Tauri commands
| Command | Description |
|---------|-------------|
| `voice_list_input_devices` | List active physical capture endpoints |
| `voice_list_monitor_outputs` | List active render endpoints (excluding Audapp) |
| `voice_start_lab` | Start capture + processing worker |
| `voice_stop_lab` | Stop worker |
| `voice_get_status` | Poll current status (peak, RMS, gate, state) |
| `voice_update_settings` | Update processing settings live while running |

---

## 8. Build Results

```
cargo check:
  Finished `dev` profile [unoptimized + debuginfo] target(s) in 27.40s
  (0 errors, only pre-existing warnings unrelated to voice_lab)

npm run build:
  tsc — pass
  vite build — ✓ 1918 modules transformed
  ✓ built in 5.46s
```

---

## 9. Manual Smoke Test

**Environment:** Windows 10 VM (no physical microphone attached)

- App launched successfully with `npm run tauri dev`
- Navigation → Voice Lab page renders correctly
- Input device selector shows "No input devices found" (expected in VM without mic)
- "Rescan devices" button visible and functional
- Monitor output card toggles correctly
- Processing controls render (gain slider, HP toggle, gate toggle, limiter toggle)
- Honest callout note visible
- Start button disabled when no device selected (correct)
- Build passes — code path is ready for host/hardware testing with a real microphone

**Result: Acceptable partial success** (VM has no physical mic; UI handles the no-device case correctly; all build checks pass)

---

## 10. Known Limitations

1. **No physical microphone in VM** — full capture path cannot be live-tested until run on host hardware with a real mic.
2. **No compressor** — skipped per plan; gate + limiter handles the common use cases.
3. **No processed virtual mic output** — explicitly pending. The UI states this clearly.
4. **Gate is binary (0/1)** — no soft-knee expansion. Sufficient for a lab POC.
5. **No noise floor estimation** — RMS is shown but noise floor analysis is not implemented.

---

## 11. Exact Next Step

**Phase 20D (recommended):** Test the Voice Lab on host hardware with a real microphone:
1. Open Voice Lab, select physical mic, start capture
2. Confirm raw meters respond to voice
3. Enable gate, speak, confirm gate open/closed transitions
4. Enable monitor output with headphones, confirm processed audio is audible
5. Test start/stop cycling and confirm Bridge Lab still works afterward

If the host test passes, the next development phase could be:
- **Phase 21A:** Implement the processed virtual microphone output path (routed through the `Mikrofon (Audapp Input)` endpoint, once that endpoint is verified functional as a virtual mic injection point)
