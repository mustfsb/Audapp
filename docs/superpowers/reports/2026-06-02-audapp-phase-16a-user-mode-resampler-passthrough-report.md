# Audapp Phase 16A — User-Mode Resampler + Pass-Through Enablement Report

**Date:** 2026-06-02  
**Branch:** codex/phase-12h-driver-binding-fix-docs  
**Phase:** 16A — User-Mode Resampler + Physical Output Pass-Through Enablement

---

## 1. Driver Preflight

```
devcon status @ROOT\DEVGEN\AUDAPP12G0001
→ Name: Audapp Input — Driver is running.

ProblemCode:  0
ProblemStatus: (empty)
DriverInfPath: oem19.inf
```

No regression. Driver state intact.

---

## 2. Endpoint Preflight

```
{6dee1be1-...}  Hoparlör  State=1 (Active)  ← Audapp Input render
{6a08946d-...}  Hoparlör  State=1 (Active)  ← physical HDAUDIO
```

Both endpoints active.

---

## 3. Implementation Summary

### Problem (Phase 15B limitation)

The physical HDAUDIO output defaults to 48000 Hz in Windows shared mode while Audapp Input runs at 44100 Hz. Phase 15B detected this as `format_mismatch` and disabled the monitor path entirely.

### Solution (Phase 16A)

A new `LinearResampler` module (`src-tauri/src/audio_bridge/resampler.rs`) implements linear interpolation resampling for interleaved f32 PCM. When the loopback and monitor endpoints are both float32 but differ in sample rate, the bridge now creates a resampler and enters `resampled_passthrough` mode instead of blocking.

### `LinearResampler` design

```
algorithm:   linear interpolation between adjacent input frames
inputs:      interleaved f32 samples, any channel count
ratio:       in_rate / out_rate (e.g. 0.91875 for 44100→48000)
phase state: fractional carry-over across block boundaries
             → seamless inter-call continuity
output:      interleaved f32, clamped to [-1.0, 1.0]
allocation:  output Vec pre-sized to ~ceil(in_frames / ratio) + 2
unbounded growth: none — bounded by MAX_LOOPBACK_BUF (96000 samples)
```

### Decision tree for monitor mode

```
rate_mismatch AND both float32  →  LinearResampler → resampled_passthrough
rate_mismatch AND non-float     →  format_mismatch (cannot resample)
same rate                       →  direct copy     → passthrough
no monitor enabled              →  capture_only
```

### Worker changes

- `MAX_LOOPBACK_BUF = 96_000` replaces hardcoded 88200 (covers ~1 s stereo at 48000 Hz).
- `monitor_resampler: Option<LinearResampler>` lives alongside the `MonitorStream`.
- In the loopback read inner loop: if resampler is active, captured float32 frames are immediately resampled before being pushed into `loopback_buf`. The monitor write section receives output-rate frames and continues unchanged.
- Dropped frames (buffer full while resampled output cannot fit) tracked in `mon_dropped`.
- Status now reports: `resampler_active`, `resampler_ratio`, `pending_frames`, `dropped_frames`.

### New `BridgeMode` variant

```rust
ResampledPassthrough  // serialized as "resampled_passthrough"
```

---

## 4. Resampler Support Matrix

| Input | Output | Channel handling | Result |
|-------|--------|-----------------|--------|
| float32 any rate | float32 any rate | same channels | `resampled_passthrough` |
| float32 same rate | float32 same rate | same channels | `passthrough` (no resampler) |
| float32 any rate | float32 any rate | different channels | resampler + `mix_channels` |
| non-float | any | — | `format_mismatch` |
| float32 | non-float | — | `format_mismatch` |

**Common case covered:** 44100 Hz float32 stereo → 48000 Hz float32 stereo (ratio 0.91875).

---

## 5. Files Changed

| File | Change |
|------|--------|
| `src-tauri/src/audio_bridge/resampler.rs` | New — `LinearResampler` struct with `new()`, `resample()`, `ratio()`; unit tests |
| `src-tauri/src/audio_bridge/mod.rs` | Added `mod resampler;` |
| `src-tauri/src/audio_bridge/types.rs` | Added `ResampledPassthrough` to `BridgeMode`; added `resampler_active`, `resampler_ratio`, `pending_frames`, `dropped_frames` to `BridgePocStatus` |
| `src-tauri/src/audio_bridge/worker.rs` | Added `LinearResampler` import; `MAX_LOOPBACK_BUF` const; `monitor_resampler`; `mon_dropped`; rate-mismatch now creates resampler (not format_mismatch); loopback buf fill resamples if active; status sync includes new counters |
| `src/types/bridge.ts` | Added `resampled_passthrough` to `BridgeMode`; added `resamplerActive`, `resamplerRatio`, `pendingFrames`, `droppedFrames` |
| `src/lib/use-audio-bridge.ts` | Added new fields to `STOPPED_STATUS` |
| `src/components/bridge/bridge-lab-view.tsx` | Added purple `resampled_passthrough` badge; resampled pass-through info banner; resampler ratio/pending/dropped rows in runtime card |

No driver files, INF files, root device scripts, or boot settings changed.

---

## 6. Build Results

```
cargo check --manifest-path src-tauri\Cargo.toml
→ 0 errors, pre-existing warnings only
→ Finished dev profile in 3.43s

npm run build
→ ✓ built in 5.23s, 0 errors
```

---

## 7. Smoke Test

`npm run tauri dev` not run as automated test (90-second timeout cuts off before window opens). Build success confirms the binary compiles.

**Manual smoke test steps (critical path):**

1. Confirm Windows output is set to **Hoparlör (Audapp Input)**
2. Open Audapp → Bridge Lab (`npm run tauri dev`)
3. Enable **Physical monitor output** toggle
4. Select the HDAUDIO physical speakers (48000 Hz) from the output radio list
5. Click **Start POC**
6. Observe mode badge — should show **purple "resampled pass-through"** (not amber "format mismatch")
7. Play audio in any app
8. Confirm:
   - `renderLoopback.framesRead` increases
   - `monitorOutput.framesWritten` increases
   - `renderLoopback.peak` / `rms` bars move
   - Resampler ratio shows ~0.91875 (44100/48000)
   - Audio is audible on the selected physical output
9. Click **Stop POC**
10. Start again once to confirm clean restart

**If mode still shows format_mismatch:** the physical output's mix format is non-float or the loopback is non-float. Check Windows Sound → device Properties → Advanced. Both should be "32-bit float, …" if WASAPI shared-mode defaults are used.

---

## 8. Known Limitations

1. **Manual counter verification pending** — interactive GUI required to confirm `framesWritten` increases.
2. **Linear interpolation quality** — this is a simple linear resampler, not a windowed sinc or polyphase filter. For 44100→48000 the ratio is rational (= 441/480) so quality is adequate for monitoring; not production-grade for DAW use.
3. **Non-float input** — WASAPI shared mode always delivers float32 in practice on modern Windows, so this branch should not be reached; the `format_mismatch` fallback is there as a safety net.
4. **Channel count > 2** — `mix_channels` handles arbitrary channel counts via a fallback copy loop; stereo↔mono is the tested path.
5. **No rate-change notification** — if Windows changes the endpoint mix rate at runtime (rare), the bridge continues with the original resampler ratio until restarted.

---

## 9. Exact Next Step

**Manual test (user):** Run `npm run tauri dev`, open Bridge Lab, enable physical monitor output, start POC, play audio, confirm mode = resampled_passthrough and frames_rendered increases.

**If audio is audible (Phase 16A success):**  
→ Phase 17: stabilize the POC (latency measurement, underrun reduction, UI polish for daily use)

**If audio is not audible but counters increase:**  
→ Investigate physical output: check if the selected device is the correct audio output target in Windows volume mixer; check if sample format mismatch occurs at a deeper level.

**If mode still shows format_mismatch:**  
→ Confirm both endpoints return float32 from GetMixFormat; check if WASAPI is using a non-float master format for the Audapp Input endpoint (unlikely — the driver registers ACX which defaults to float32 shared mode).

---

## Summary

| Item | Result |
|------|--------|
| Driver state | OK — running, ProblemCode 0 |
| Endpoint state | Both Audapp endpoints active |
| LinearResampler | Implemented — linear interpolation, phase-continuous across blocks |
| 44100→48000 path | resampled_passthrough mode (no longer format_mismatch) |
| `cargo check` | 0 errors |
| `npm run build` | 0 errors |
| `npm run tauri dev` | Compiles (manual window test pending) |
| Commits | None (per safety boundary) |
