# Audapp Phase 15B — User-Mode Routing / Physical Output Pass-Through Report

**Date:** 2026-06-02  
**Branch:** codex/phase-12h-driver-binding-fix-docs  
**Phase:** 15B — User-Mode Routing + Physical Output Pass-Through

---

## 1. Driver Preflight

```
devcon status @ROOT\DEVGEN\AUDAPP12G0001
→ Name: Audapp Input
→ Driver is running.
→ 1 matching device(s) found.
```

**Driver state intact. No regression.**

---

## 2. Endpoint Preflight

MMDevice Render registry:

```
{6dee1be1-f344-45e4-aa77-2fb20caac6b9}  Hoparlör  State=1 (Active)  ← Audapp Input render
{6a08946d-0d29-4ac5-a577-e61d69be0195}  Hoparlör  State=1 (Active)  ← physical HDAUDIO
```

Both endpoints active. No change from Phase 14B baseline.

---

## 3. Phase 15B Baseline (Phase 14B Manual Smoke Test Result)

Phase 14B manual smoke test confirmed real audio flow:

```
Input: Hoparlör (Audapp Input)
Render Loopback: active — Initialize OK, Start OK
Packets: increasing
Frames: increasing
Bytes: increasing
Peak/RMS: changing with audio

Capture Endpoint Read: active — Initialize OK, Start OK
Packets: increasing
Frames: increasing
Bytes: increasing
Peak/RMS: changing with audio
```

This established Outcome A+: loopback capture works AND capture endpoint receives audio (likely driver-side internal loopback routing already present).

---

## 4. Implementation Summary

Phase 15B built on the Phase 14B WASAPI bridge to add proper format-aware pass-through with clear diagnostics.

### 4.1 Rate tracking fix in LoopStream

The Phase 14B worker hardcoded `44100u32` when comparing loopback rate against the physical output rate. This made the format check unreliable for non-44100 physical outputs (e.g., 48000 Hz HDAudio).

**Fix:** Added `rate: u32` field to the `LoopStream` struct. `open_loopback_capture` now returns the actual `rate` from `GetMixFormat`, and the monitor rate check uses `ls.rate` instead of a hardcoded value.

```rust
// Before (Phase 14B)
let lb_rate = loopback.as_ref().map(|_| { 44100u32 });

// After (Phase 15B)
let lb_rate = loopback.as_ref().map(|l| l.rate);
```

### 4.2 BridgeMode enum

New enum added to `types.rs`:

```rust
pub enum BridgeMode {
    CaptureOnly,    // no monitor output
    Passthrough,    // loopback → physical output active
    FormatMismatch, // capture OK but monitor disabled due to rate/channel mismatch
    Error,          // fatal error
}
```

Serializes as `snake_case` for TypeScript.

### 4.3 Format strings in status

Added to `BridgePocStatus`:
- `input_format: Option<String>` — e.g. `"44100Hz 2ch float32"`
- `output_format: Option<String>` — e.g. `"48000Hz 2ch float32"`
- `mode: BridgeMode` — current routing mode

These are set during stream initialization, before the main poll loop starts.

### 4.4 Format mismatch diagnostic

When the physical output sample rate differs from the loopback rate:
- `format_mismatch = true` is set
- `output_format` is stored with the physical output's actual format
- `monitor_output.last_error` is set to a descriptive message: `"Format mismatch: input=44100Hz, output=48000Hz. Pass-through disabled."`
- `mode` is set to `FormatMismatch` when Running

Capture continues regardless of monitor state.

### 4.5 Mode is set at transition to Running

```rust
s.mode = if monitor.is_some() {
    BridgeMode::Passthrough
} else if format_mismatch {
    BridgeMode::FormatMismatch
} else {
    BridgeMode::CaptureOnly
};
```

### 4.6 UI improvements

- **Mode badge** shown alongside state badge in Runtime section (blue for pass-through, amber for format mismatch)
- **Format mismatch banner** when `mode === "format_mismatch"` — shows input format, output format, explanation, and hint to fix
- **Input format / Output format rows** shown in runtime card
- Phase description updated to "Phase 15B — User-mode routing POC"

---

## 5. Pass-Through Path (Physical Output)

The pass-through path from Phase 14B is retained and now correctly guarded:

```
IAudioCaptureClient (loopback, Audapp Input render)
→ loopback_buf: Vec<f32> (bounded 88200 samples / ~1s at 44100Hz 2ch)
→ mix_channels() — stereo↔mono conversion
→ IAudioRenderClient (selected physical output)
```

**Compatible format required:** Same sample rate. Channel mismatch (stereo/mono) is handled by `mix_channels`. Other channel counts fall back to a per-channel copy.

**Known constraint (pre-existing):** The physical HDAUDIO device on this machine uses 48000 Hz in its default Windows mix format. Since Audapp Input uses 44100 Hz, the monitor output will be in `FormatMismatch` state when that device is selected. The UI now reports this clearly.

---

## 6. Files Changed

| File | Change |
|------|--------|
| `src-tauri/src/audio_bridge/types.rs` | Added `BridgeMode` enum; added `mode`, `input_format`, `output_format` to `BridgePocStatus` and its Default impl |
| `src-tauri/src/audio_bridge/worker.rs` | Added `rate: u32` to `LoopStream`; fixed `open_loopback_capture` to return rate; added `format_mismatch` flag; fixed monitor rate check; set `mode`/`input_format`/`output_format` in status |
| `src-tauri/src/audio_bridge/mod.rs` | No net change (added then removed `BridgeMode` re-export — unused externally) |
| `src/types/bridge.ts` | Added `BridgeMode` type; added `mode`, `inputFormat`, `outputFormat` to `BridgePocStatus` |
| `src/lib/use-audio-bridge.ts` | Added `mode`, `inputFormat`, `outputFormat` to `STOPPED_STATUS` |
| `src/components/bridge/bridge-lab-view.tsx` | Added `modeLabel`/`modeColor` helpers; added mode badge, format mismatch banner, format rows in runtime section; updated phase description |

No driver files, INF files, root device scripts, or boot settings changed.

---

## 7. Build Results

```
cargo check --manifest-path src-tauri\Cargo.toml
→ 0 errors, 25 pre-existing warnings (unchanged)
→ Finished dev profile in 9.54s

npm run build
→ ✓ 1906 modules transformed. ✓ built in 5.46s
```

---

## 8. Smoke Test

`npm run tauri dev` — not run as a full automated test (previous session confirmed 90s timeout cuts off before window opens). Based on `cargo check` + `npm run build` success, the binary compiles cleanly.

**Manual smoke test steps:**

1. Run `npm run tauri dev`
2. Navigate to **Bridge Lab**
3. Confirm "Discovered Endpoints" shows Hoparlör (Audapp Input) as audapp render
4. Enable "Physical monitor output" toggle
5. Select a physical output device from the radio list
6. Click **Start POC**
7. Play audio in any app

**Expected when physical output uses 44100 Hz:**
- Mode badge shows **pass-through** (blue)
- Input format: `44100Hz 2ch float32`
- Output format: `44100Hz 2ch float32`
- `renderLoopback.framesRead` increases
- `monitorOutput.framesWritten` increases
- Audio is audible on selected physical output

**Expected when physical output uses 48000 Hz (HDAudio default):**
- Mode badge shows **format mismatch** (amber)
- Amber banner appears: "Format mismatch — pass-through disabled"
- Input format: `44100Hz 2ch float32`
- Output format: `48000Hz 2ch float32`
- `renderLoopback.framesRead` still increases (capture still works)
- `monitorOutput.framesWritten` stays at 0 (monitor disabled)
- `monitorOutput.lastError` shows: "Format mismatch: input=44100Hz, output=48000Hz. Pass-through disabled."

8. Click **Stop POC**
9. Start/stop again to verify clean cleanup

---

## 9. Known Limitations

1. **No sample-rate conversion** — pass-through requires exact sample-rate match between Audapp Input (44100 Hz) and the physical output. The typical HDAUDIO at 48000 Hz will trigger format mismatch. To enable pass-through: change Windows mix rate for the physical device to 44100 Hz (Sound → Properties → Advanced → Default Format) or change Audapp Input driver mix rate (requires driver rebuild).
2. **Manual counter verification pending** — interactive GUI test required for the `Passthrough` mode path.
3. **`loopback_buf` cap at 88200 samples** — ~1s of stereo 44100 Hz audio. If the monitor output stalls, older audio is dropped rather than buffering unboundedly.
4. **Phase 14B limitation persists** — no resampler; sample-rate mismatch disables monitor output rather than converting.

---

## 10. Exact Next Step — Format Mismatch Resolution

The format mismatch (44100 Hz Audapp Input vs 48000 Hz HDAudio) is the primary blocker for audible pass-through on the current machine.

**Option A: Change physical output mix rate (no code change)**
- Sound → device Properties → Advanced → Default Format → 44100 Hz, 16/24 bit
- Restart Bridge POC
- If format matches, mode badge changes to "pass-through" and audio routes

**Option B: Change Audapp Input driver mix rate (driver work)**
- In `RenderCircuit.cpp`: change `SampleRate` to 48000
- In `CaptureCircuit.cpp`: change `SampleRate` to 48000
- Rebuild, re-sign, reinstall driver
- Both endpoints would then use 48000 Hz
- Monitor output to HDAudio would become compatible

**Option C: Add linear resampler (user-mode, Phase 16)**
- Add a simple linear interpolator in `worker.rs` for the loopback → monitor path
- No driver changes needed
- Enables pass-through regardless of sample rate pair

---

## Summary

| Item | Result |
|------|--------|
| Driver state | OK — running, ProblemCode 0 |
| Endpoint state | Both Audapp endpoints active, State=1 |
| Phase 14B baseline | Capture + loopback counters confirmed increasing with audio |
| Rate tracking fix | `LoopStream.rate` now stores actual WASAPI loopback rate (was hardcoded 44100) |
| `BridgeMode` enum | Added: `CaptureOnly`, `Passthrough`, `FormatMismatch`, `Error` |
| Format strings | `input_format`/`output_format` in status DTO |
| Format mismatch diagnostic | Clear banner in UI with format details and fix hint |
| Mode badge | Blue = pass-through, amber = format mismatch |
| `cargo check` | 0 errors |
| `npm run build` | 0 errors, 1906 modules |
| Pass-through audio (manual) | Pending — requires format-compatible physical output |
| Commits | None (per safety boundary) |
