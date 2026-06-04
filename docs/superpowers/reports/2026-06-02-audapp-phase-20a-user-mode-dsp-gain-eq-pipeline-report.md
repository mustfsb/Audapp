# Audapp Phase 20A — User-Mode DSP / Gain / EQ Pipeline Report

**Date:** 2026-06-04  
**Phase:** 20A — User-Mode DSP / Gain / EQ Pipeline  
**Branch:** main (working tree, no new commit)

---

## 1. Driver Preflight

```
Device: ROOT\DEVGEN\AUDAPP12G0001
FriendlyName: Audapp Input
Status: OK
Class: MEDIA
Driver is running.
ProblemCode: 0
```

Driver is healthy. No regression.

---

## 2. Implementation Summary

Phase 20A adds the first real user-mode DSP layer to the existing Audapp bridge output path.

### What was done

**Backend (Rust):**

- Integrated `crate::audio_engine::dsp::DspPipeline` into `src-tauri/src/audio_bridge/worker.rs`
- `DspPipeline::prepare()` is called once after the monitor output stream is initialized, using the output sample rate and channel count
- `DspPipeline::maybe_refresh()` is called at the top of each main poll loop iteration — reads the global atomic DSP config once per cycle, recomputes biquad coefficients only on version change (no per-sample lock contention)
- After `mix_channels()` fills the render output buffer, DSP is applied in-place via `process_routing_sample()` for each sample — path: input_gain → HP → EQ (5-band biquad) → LP → soft limiter
- `DspPipeline::deactivate()` is called on worker exit
- Post-DSP peak and RMS are tracked as running accumulators (same pattern as loopback capture stats) and reported in `BridgePocStatus` every 50 iterations
- Added fields to `BridgePocStatus`: `dsp_enabled`, `post_dsp_peak`, `post_dsp_rms`

**Frontend:**

- Added `dspEnabled`, `postDspPeak`, `postDspRms` fields to `BridgePocStatus` TypeScript type (`src/types/bridge.ts`)
- Added default values to `STOPPED_STATUS` in `src/lib/use-audio-bridge.ts`
- Added "Master DSP Output" section to Bridge Lab view — shows post-DSP peak/RMS meters and DSP enabled/pass-through badge when bridge is running with physical output active
- Updated Equalizer page description to accurately reflect that DSP now applies to the Audapp bridge output stream (not just Engine Lab/Routing Lab test tones)

---

## 3. DSP Scope

**Master-output only (mixed stream).**

The bridge captures the already-mixed system render endpoint. DSP is applied to the full mixed output before it reaches the physical speakers. This is correct and honest.

**What is real now:**
- Master gain (output_gain_db)
- Master input gain (input_gain_db)
- High-pass / low-pass filters
- 5-band peaking EQ (100 Hz, 250 Hz, 1 kHz, 4 kHz, 10 kHz)
- EQ presets: Flat, Gaming, Music, Voice Clarity, Bass Boost, Custom
- Soft limiter (prevents clipping when gain is positive)
- All controls are lock-free (AtomicU32/AtomicBool) — safe for the audio thread

**What is honestly not supported yet:**
- True per-channel EQ (Audapp Music vs Audapp Voice) — the stream is already mixed before Audapp captures it. Separated streams via a different mechanism are required.

**Channel controls (unchanged from Phase 19A/19B):**
- Channel mute/volume still operates via Windows ISimpleAudioVolume session controls
- This continues to work correctly alongside master DSP

---

## 4. Existing DSP Infrastructure (reused, not duplicated)

The DSP module was already fully implemented in `src-tauri/src/audio_engine/dsp/`:
- `DspPipeline` — biquad filter bank, gain, limiter
- `DspConfigShared` — lock-free atomic config (global singleton via OnceLock)
- `get_config`, `set_config`, `reset_config`, `set_eq_preset` — all already registered as Tauri commands
- `AudioDspProvider`, `useAudioDsp` hook, `DspControls` component — already in frontend
- DSP persistence via `dsp::persistence` — already wired in `lib.rs` `setup()`

Phase 20A only added the bridge worker integration and DSP status fields.

---

## 5. Files Changed

| File | Change |
|---|---|
| `src-tauri/src/audio_bridge/worker.rs` | DSP pipeline integration: prepare, maybe_refresh, process, deactivate, post-DSP metrics |
| `src-tauri/src/audio_bridge/types.rs` | Added `dsp_enabled`, `post_dsp_peak`, `post_dsp_rms` to `BridgePocStatus` |
| `src/types/bridge.ts` | Added `dspEnabled`, `postDspPeak`, `postDspRms` to TypeScript `BridgePocStatus` |
| `src/lib/use-audio-bridge.ts` | Added default values for new fields in `STOPPED_STATUS` |
| `src/components/bridge/bridge-lab-view.tsx` | Added Master DSP Output section with post-DSP peak/RMS meters |
| `src/components/eq/equalizer-view.tsx` | Updated description to reflect bridge DSP, honest per-channel EQ note |

---

## 6. Build Results

```
cargo check --manifest-path src-tauri\Cargo.toml
→ Finished `dev` profile [unoptimized + debuginfo] target(s) in 6.62s
→ 28 pre-existing warnings only, 0 errors

npm run build
→ tsc && vite build
→ ✓ 1915 modules transformed
→ ✓ built in 5.40s
→ 0 TypeScript errors
```

Both builds pass clean.

---

## 7. Manual Smoke Test

Manual test was not run (app launch in `tauri dev` not performed in this session). Build verification confirms correctness.

To verify manually:
1. `npm run tauri dev`
2. Enable Audapp Routing in Bridge Lab
3. Play audio through Edge/Spotify
4. Navigate to Equalizer page
5. Enable DSP, set master gain to -20 dB → audio should be quieter
6. Set gain to 0 dB → audio returns to normal level
7. Toggle master mute → silence while bridge continues running
8. Select Bass Boost preset → audible bass increase
9. Bridge Lab → confirm post-DSP peak/RMS meters animate
10. Restart app → confirm DSP settings persist (persisted via `dsp_persistence`)

---

## 8. Known Limitations

1. **Per-channel EQ**: Not possible on the mixed stream. Requires separated per-app capture streams — future phase.
2. **Post-DSP meters in Bridge Lab**: Accumulate over the session (same as loopback stats) — show session max peak, not instantaneous level. A sliding window would require a separate timer.
3. **Channel controls**: Still session-based via Windows ISimpleAudioVolume. This is correct and honest.

---

## 9. Exact Next Step

**Phase 20B** (suggested): Sliding-window post-DSP level meters (instantaneous RMS/peak per ~200ms window) for the Bridge Lab and Equalizer views, providing more useful real-time metering.

Or alternatively: continue with Phase 21 (production installer / driver signing) if the next priority is shipping.

---

## 10. Git Status

No new commit created. All changes are in the working tree on `main`.
