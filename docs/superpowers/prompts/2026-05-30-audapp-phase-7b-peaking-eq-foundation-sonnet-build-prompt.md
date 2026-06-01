# Audapp — Phase 7B: Peaking EQ Foundation Implementation

## Target Thread
Audapp — Phase 7B Peaking EQ Foundation Implementation

## Target Agent
Claude Code

## Suggested Model / Effort
Claude Sonnet 4.6 — High effort

## Mode
Build mode

## Suggested Skills
- `executing-plans`
- `windows-audio`
- `wasapi`
- `real-time-audio`
- `dsp`
- `audio-dsp`
- `rust`
- `windows-rs`
- `tauri-app-architecture`
- `frontend-integration`

## Project Name
Audapp

## Project Path
```text
C:\Users\mustafa\Audapp
```

---

## Prompt

You are working on **Audapp**, a Windows desktop audio control application built with:

- Rust
- Tauri v2
- React
- TypeScript
- shadcn/ui
- Tailwind CSS
- `windows-rs`

The project path is:

```text
C:\Users\mustafa\Audapp
```

This task is **Phase 7B: Peaking EQ Foundation Implementation**.

Work directly on the current `main` branch. Do not create a new branch. Do not expand scope beyond this prompt.

---

# Required Planning Document

Before making code changes, read the Phase 7A plan:

```text
C:\Users\mustafa\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-7a-peaking-eq-foundation-plan.md
```

Use it as the primary implementation source.

---

# Current Project State

## Phase 6B DSP Foundation (present, verified green)

`src-tauri/src/audio_engine/dsp/` exists with 7 files:

| File | Content |
|---|---|
| `biquad.rs` | `BiquadCoeffs` (Copy, IDENTITY const), `BiquadState` (Copy, Default), Direct Form II Transposed `process()`, denormal flush |
| `filters.rs` | `lowpass_coeffs`, `highpass_coeffs` (RBJ, Butterworth Q=0.7071068), `clamp_cutoff` |
| `gain.rs` | `db_to_linear`, `clamp_gain_db` (-24..+12 dB) |
| `config.rs` | `OnceLock<DspConfigShared>`, atomics for all config fields + `version: AtomicU32`, `get/set/reset_config`, `get_status` |
| `pipeline.rs` | `DspPipeline` — `prepare`, `maybe_refresh` (once per buffer cycle), `process_render_mono`, `process_capture_sample` |
| `types.rs` | `DspRuntimeConfig`, `DspRuntimeStatus` (serde camelCase) |
| `mod.rs` | `pub use` of all public API |

**Current signal chain:** `gain → HPF → LPF` (render mono and per-channel capture).

**Current `DspConfigShared` atomics:** `enabled`, `output_gain_db`, `input_gain_db`, `high_pass_enabled`, `high_pass_hz`, `low_pass_enabled`, `low_pass_hz`, `version`, `active_in_engine`, `supported`, `unsupported_reason_idx`, `sample_format_tag`.

All existing DSP tests pass (19/19). `cargo check` and `npm run build` clean.

The existing `DspPipeline` uses a version-based cache: `maybe_refresh()` reads the `version` AtomicU32 once per buffer cycle; if changed, reads all config atomics and recomputes biquad coefficients. Per-sample code only does cached biquad arithmetic. No heap allocation after `prepare()`.

## Other phases (all present, must be preserved)

- Real Windows audio discovery (Dashboard / Apps / Devices)
- Real per-session volume/mute (ISimpleAudioVolume)
- Mixer group mute/volume (local group controls)
- WASAPI Audio Engine Lab: render silence, test tone, capture meter/null, runtime status
- Apps live volume with 100 ms throttle

---

# Main Objective

Add **5-band peaking EQ** to the existing DSP foundation.

**Target signal chain after Phase 7B:**
```
gain → HPF → [100 Hz] → [250 Hz] → [1 kHz] → [4 kHz] → [10 kHz] → LPF
```

EQ applies only to:
- Audio Engine Lab render test tone
- Audio Engine Lab capture meter / capture-to-null

EQ must **not** apply to: real app sessions, Mixer groups, system output, or any production chain.

---

# Strict Scope Boundary

## Implement

- `dsp/eq.rs` — peaking EQ coefficient generation + fixed band constants
- Extend `dsp/types.rs` — `EqBandConfig` struct, `eq_enabled` and `eq_bands` fields on `DspRuntimeConfig`
- Extend `dsp/config.rs` — `eq_enabled`, `eq_band_gains[5]`, `eq_band_enabled[5]` atomics in `DspConfigShared`
- Extend `dsp/pipeline.rs` — per-channel per-band EQ state, `maybe_refresh` EQ coeff recompute, EQ insertion in `process_render_mono` and `process_capture_sample`
- Extend `dsp/mod.rs` — `pub mod eq`
- Rust tests for EQ coefficients
- `src/types/audio-engine.ts` — `EqBandConfig` type, extend `DspRuntimeConfig`
- `src/lib/use-audio-dsp.ts` — add default EQ bands to `DEFAULT_DSP_CONFIG`
- `src/components/engine/engine-lab-view.tsx` — EQ Bands subsection in existing DSP/EQ Test card

## Do Not Implement

- 10-band graphic EQ
- Per-band adjustable Q or frequency UI
- Production Equalizer page wiring (`src/components/eq/equalizer-view.tsx` stays mock-only)
- System-wide EQ or per-app EQ
- Mic/headphone enhancement
- Noise suppression (RNNoise, SpeexDSP)
- Compressor / limiter / gate
- Virtual audio devices, drivers, APOs
- Session notifications / callbacks
- New Tauri commands (existing 4 DSP commands handle extended config)
- EQ frequency response visualization
- Preset system

---

# Files to Inspect First

```text
src-tauri/src/audio_engine/dsp/mod.rs
src-tauri/src/audio_engine/dsp/types.rs
src-tauri/src/audio_engine/dsp/config.rs
src-tauri/src/audio_engine/dsp/pipeline.rs
src-tauri/src/audio_engine/dsp/biquad.rs
src-tauri/src/audio_engine/dsp/filters.rs
src-tauri/src/audio_engine/dsp/gain.rs
src-tauri/src/audio_engine_commands.rs
src-tauri/src/lib.rs
src/types/audio-engine.ts
src/lib/use-audio-dsp.ts
src/components/engine/engine-lab-view.tsx
src/components/eq/equalizer-view.tsx
```

---

# Part 1 — New File: `dsp/eq.rs`

Create `src-tauri/src/audio_engine/dsp/eq.rs`.

```rust
use std::f32::consts::PI;
use super::biquad::BiquadCoeffs;
use super::filters::clamp_cutoff;

pub const NUM_EQ_BANDS: usize = 5;
pub const EQ_FREQUENCIES: [f32; NUM_EQ_BANDS] = [100.0, 250.0, 1000.0, 4000.0, 10000.0];
pub const EQ_GAIN_MIN_DB: f32 = -12.0;
pub const EQ_GAIN_MAX_DB: f32 = 12.0;
pub const EQ_Q: f32 = 1.0;

pub fn clamp_eq_gain_db(db: f32) -> f32 {
    db.clamp(EQ_GAIN_MIN_DB, EQ_GAIN_MAX_DB)
}

/// RBJ cookbook peaking EQ coefficients.
/// Returns BiquadCoeffs::IDENTITY when abs(gain_db) < 0.01 (transparent band shortcut).
pub fn peaking_eq_coeffs(fc: f32, fs: f32, gain_db: f32, q: f32) -> BiquadCoeffs {
    if gain_db.abs() < 0.01 {
        return BiquadCoeffs::IDENTITY;
    }
    let fc = clamp_cutoff(fc, fs);
    let q = q.max(0.1);
    let a = 10.0_f32.powf(gain_db / 40.0);
    let w0 = 2.0 * PI * fc / fs;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * q);
    let b0 = 1.0 + alpha * a;
    let b1 = -2.0 * cos_w0;
    let b2 = 1.0 - alpha * a;
    let a0 = 1.0 + alpha / a;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha / a;
    BiquadCoeffs { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 }
}
```

Add `#[cfg(test)] mod tests` with these tests:

1. `peaking_eq_coefficients_finite` — `peaking_eq_coeffs(1000.0, 48000.0, 6.0, EQ_Q)` all fields finite
2. `peaking_eq_dc_gain_near_unity` — `(b0+b1+b2)/(1.0+a1+a2).abs() - 1.0 < 1e-3` for both boost (+6 dB) and cut (-6 dB)
3. `peaking_eq_nyquist_gain_near_unity` — `(b0-b1+b2)/(1.0-a1+a2).abs() - 1.0 < 1e-3`
4. `peaking_eq_zero_gain_returns_identity` — 0.0 dB → same as `BiquadCoeffs::IDENTITY`
5. `peaking_eq_no_panic_degenerate_fs` — `peaking_eq_coeffs(1000.0, 1.0, 6.0, 1.0).b0.is_finite()`
6. `clamp_eq_gain_db_clamps` — 100.0 → 12.0, -100.0 → -12.0, 0.0 → 0.0

---

# Part 2 — `dsp/types.rs` Changes

Add `EqBandConfig` struct:

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EqBandConfig {
    pub id: String,
    pub frequency_hz: f32,
    pub gain_db: f32,
    pub enabled: bool,
}
```

Extend `DspRuntimeConfig` with:
```rust
pub eq_enabled: bool,
pub eq_bands: Vec<EqBandConfig>,
```

**Important:** The existing `DspRuntimeConfig::default()` (or the `Default` impl) must now produce 5 `EqBandConfig` entries. If `DspRuntimeConfig` currently uses `#[derive(Default)]`, replace it with an explicit `impl Default` that constructs the 5 bands from `EQ_FREQUENCIES`:

```rust
impl Default for DspRuntimeConfig {
    fn default() -> Self {
        use super::eq::{EQ_FREQUENCIES, NUM_EQ_BANDS};
        Self {
            enabled: false,
            output_gain_db: 0.0,
            input_gain_db: 0.0,
            high_pass_enabled: false,
            high_pass_hz: 80.0,
            low_pass_enabled: false,
            low_pass_hz: 18000.0,
            eq_enabled: false,
            eq_bands: (0..NUM_EQ_BANDS).map(|i| EqBandConfig {
                id: format!("band_{}hz", EQ_FREQUENCIES[i] as u32),
                frequency_hz: EQ_FREQUENCIES[i],
                gain_db: 0.0,
                enabled: true,
            }).collect(),
        }
    }
}
```

---

# Part 3 — `dsp/config.rs` Changes

Add to `DspConfigShared`:
```rust
pub eq_enabled: AtomicBool,
pub eq_band_gains: [AtomicU32; 5],    // f32 bits, 0.0 dB default
pub eq_band_enabled: [AtomicBool; 5], // all true default
```

**Important:** `[AtomicU32; 5]` and `[AtomicBool; 5]` cannot use array repeat syntax because `AtomicU32`/`AtomicBool` are not `Copy`. Initialize each element explicitly in the `OnceLock` init closure:

```rust
eq_enabled: AtomicBool::new(false),
eq_band_gains: [
    AtomicU32::new(0_f32.to_bits()),
    AtomicU32::new(0_f32.to_bits()),
    AtomicU32::new(0_f32.to_bits()),
    AtomicU32::new(0_f32.to_bits()),
    AtomicU32::new(0_f32.to_bits()),
],
eq_band_enabled: [
    AtomicBool::new(true),
    AtomicBool::new(true),
    AtomicBool::new(true),
    AtomicBool::new(true),
    AtomicBool::new(true),
],
```

Update `set_config`:
```rust
shared.eq_enabled.store(config.eq_enabled, Ordering::Relaxed);
for (i, band) in config.eq_bands.iter().enumerate().take(crate::audio_engine::dsp::eq::NUM_EQ_BANDS) {
    shared.eq_band_gains[i].store(
        crate::audio_engine::dsp::eq::clamp_eq_gain_db(band.gain_db).to_bits(),
        Ordering::Relaxed,
    );
    shared.eq_band_enabled[i].store(band.enabled, Ordering::Relaxed);
}
```

Update `get_config`:
```rust
use super::eq::{EQ_FREQUENCIES, NUM_EQ_BANDS};
let eq_bands: Vec<EqBandConfig> = (0..NUM_EQ_BANDS).map(|i| EqBandConfig {
    id: format!("band_{}hz", EQ_FREQUENCIES[i] as u32),
    frequency_hz: EQ_FREQUENCIES[i],
    gain_db: f32::from_bits(shared.eq_band_gains[i].load(Ordering::Relaxed)),
    enabled: shared.eq_band_enabled[i].load(Ordering::Relaxed),
}).collect();
// Include in returned DspRuntimeConfig:
// eq_enabled: shared.eq_enabled.load(Ordering::Relaxed),
// eq_bands,
```

`reset_config` calls `set_config(DspRuntimeConfig::default())` — no explicit change needed since the Default impl returns flat EQ.

---

# Part 4 — `dsp/pipeline.rs` Changes

## DspSnapshot

Add:
```rust
eq_enabled: bool,
```
Initialize to `false` in `new()`.

## DspPipeline new fields

```rust
// Mono output EQ chain (test tone is mono)
out_eq_states: [BiquadState; 5],
out_eq_coeffs: [BiquadCoeffs; 5],
// Per-channel input EQ chains (capture is multichannel)
in_eq_states: Vec<[BiquadState; 5]>,  // allocated in prepare()
in_eq_coeffs: [BiquadCoeffs; 5],
```

Initialize in `new()`:
```rust
out_eq_states: [BiquadState::default(); 5],
out_eq_coeffs: [BiquadCoeffs::IDENTITY; 5],
in_eq_states: Vec::new(),
in_eq_coeffs: [BiquadCoeffs::IDENTITY; 5],
```

## `prepare()` update

After the existing `in_hp_states` / `in_lp_states` allocation:
```rust
self.in_eq_states = vec![[BiquadState::default(); 5]; channels.max(1)];
```
This is a one-time allocation before the audio loop. The existing pattern already allocates `Vec<BiquadState>` for HP/LP states.

## `maybe_refresh()` update

At the end of the existing coeff-recompute block, add:
```rust
use super::eq::{peaking_eq_coeffs, NUM_EQ_BANDS, EQ_FREQUENCIES, EQ_Q};
let eq_enabled = shared.eq_enabled.load(Ordering::Relaxed);
self.snapshot.eq_enabled = eq_enabled;
for i in 0..NUM_EQ_BANDS {
    let gain_db = f32::from_bits(shared.eq_band_gains[i].load(Ordering::Relaxed));
    let band_enabled = shared.eq_band_enabled[i].load(Ordering::Relaxed);
    self.out_eq_coeffs[i] = if band_enabled && gain_db.abs() > 0.01 {
        peaking_eq_coeffs(EQ_FREQUENCIES[i], fs, gain_db, EQ_Q)
    } else {
        BiquadCoeffs::IDENTITY
    };
}
self.in_eq_coeffs = self.out_eq_coeffs;
// EQ states NOT reset — filter settles naturally into new coefficients (no click).
```

## `process_render_mono()` update

The current code (from Phase 6B) is:
```rust
let y = x * self.snapshot.output_gain;
let hp = self.out_hp_coeffs;
let lp = self.out_lp_coeffs;
let y = self.out_hp.process(y, &hp);
self.out_lp.process(y, &lp)
```

Replace with:
```rust
let y = x * self.snapshot.output_gain;
let hp = self.out_hp_coeffs;
let lp = self.out_lp_coeffs;
let mut y = self.out_hp.process(y, &hp);
if self.snapshot.eq_enabled {
    for i in 0..5 {
        let c = self.out_eq_coeffs[i];
        y = self.out_eq_states[i].process(y, &c);
    }
}
self.out_lp.process(y, &lp)
```

**Key change:** `let mut y = ...` (was `let y`). The EQ loop is only entered when `eq_enabled` is true.

## `process_capture_sample()` update

The current code applies per-channel HPF and LPF. Replace the core logic to insert EQ bands between HP and LP:

```rust
let mut y = self.in_hp_states[ci].process(y, &hp);
if self.snapshot.eq_enabled {
    for i in 0..5 {
        let c = self.in_eq_coeffs[i];
        y = self.in_eq_states[ci][i].process(y, &c);
    }
}
self.in_lp_states[ci].process(y, &lp)
```

Where `hp` and `lp` are copies of `in_hp_coeffs` and `in_lp_coeffs` (already done in Phase 6B to avoid borrow conflicts — use the same copy pattern).

---

# Part 5 — `dsp/mod.rs` Update

Add `pub mod eq;` alongside the existing module declarations.

Add re-exports if useful for tests:
```rust
pub use eq::{NUM_EQ_BANDS, EQ_FREQUENCIES};
```

---

# Part 6 — TypeScript Types and Hook

## `src/types/audio-engine.ts`

Add the `EqBandConfig` type and extend `DspRuntimeConfig`:

```ts
export type EqBandConfig = {
  id: string;
  frequencyHz: number;
  gainDb: number;
  enabled: boolean;
};

// Extend DspRuntimeConfig (add to existing type):
// eqEnabled: boolean;
// eqBands: EqBandConfig[];
```

## `src/lib/use-audio-dsp.ts`

Extend `DEFAULT_DSP_CONFIG`:

```ts
eqEnabled: false,
eqBands: [
  { id: "band_100hz",   frequencyHz: 100,   gainDb: 0, enabled: true },
  { id: "band_250hz",   frequencyHz: 250,   gainDb: 0, enabled: true },
  { id: "band_1000hz",  frequencyHz: 1000,  gainDb: 0, enabled: true },
  { id: "band_4000hz",  frequencyHz: 4000,  gainDb: 0, enabled: true },
  { id: "band_10000hz", frequencyHz: 10000, gainDb: 0, enabled: true },
],
```

No other hook changes needed. The existing `setConfig` / `commitConfig` / `reset` handle the extended config.

---

# Part 7 — Engine Lab UI

Update `src/components/engine/engine-lab-view.tsx`.

Inside the existing **"DSP / EQ Test"** card, after the HPF/LPF controls and **before** the existing Reset button, add an **EQ Bands** subsection.

## Structure

```
[EQ Bands section header]
  [EQ Enable switch]                          ← toggle eq_enabled
  [Row of 5 gain sliders]
    100 Hz   250 Hz   1 kHz   4 kHz   10 kHz
    -12..+12 -12..+12 ...
  [Mandatory copy text]
```

## Interaction pattern

- EQ enable toggle: `onCheckedChange` → `dsp.setConfig({ ...dsp.config, eqEnabled: checked })`
- Band gain sliders: `onValueChange` → `dsp.setConfig({ ...dsp.config, eqBands: updated_bands })` (throttled)
- Band gain sliders: `onValueCommit` → `dsp.commitConfig(...)` (immediate final write on release)
- All band sliders disabled when `!dsp.config.enabled || !dsp.config.eqEnabled`
- EQ enable toggle disabled when `!dsp.config.enabled`

## Mandatory copy

Include this text below the band sliders:

```
EQ bands are test-only and apply only to Audio Engine Lab streams.
They do not process app audio, routed channels, microphone enhancement, or system output yet.
```

## No new components required

Use existing shadcn `Switch`, `Slider`, and layout primitives already imported in the file.

---

# Part 8 — Real-Time Safety Rules

These must hold throughout the changes:

**Hot path (inside `process_render_mono`, `process_capture_sample`) must never:**
- Allocate heap memory (all states preallocated in `prepare()`)
- Log or print
- Call async/await or lock any mutex
- Read config atomics per-sample (only in `maybe_refresh()` once per buffer cycle)
- Call transcendental math per-sample (sin/cos/pow only in `maybe_refresh()` on config version change)
- Format strings

**Allowed in hot path:**
- Array index access
- Multiply-accumulate (biquad: ~5 FMAs per sample per band)
- `if self.snapshot.eq_enabled` branch
- Denormal flush check (< 1e-30, already in BiquadState::process)

---

# Part 9 — Tests

## Required Rust tests (in `dsp/eq.rs`)

1. `peaking_eq_coefficients_finite` — all fields finite for boost (+6 dB) and cut (-6 dB) at 1000 Hz
2. `peaking_eq_dc_gain_near_unity` — `|(b0+b1+b2)/(1+a1+a2) - 1.0| < 1e-3` for multiple gain values
3. `peaking_eq_nyquist_gain_near_unity` — `|(b0-b1+b2)/(1-a1+a2) - 1.0| < 1e-3`
4. `peaking_eq_zero_gain_returns_identity` — 0.0 dB gain produces IDENTITY coefficients
5. `peaking_eq_no_panic_degenerate_fs` — `peaking_eq_coeffs(1000.0, 1.0, 6.0, 1.0).b0.is_finite()` does not panic
6. `clamp_eq_gain_db_clamps` — 100.0 → 12.0; -100.0 → -12.0; 0.0 → 0.0

All existing 19 DSP tests must still pass.

---

# Part 10 — Verification

Run from `C:\Users\mustafa\Audapp`:

```
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
npm run build
```

All must pass. Existing tests must not regress.

## Manual smoke tests (Windows, `npm run tauri dev`)

1. Start Audapp — discovery still works
2. Apps volume/mute still works
3. Mixer group controls still work
4. Open Audio Engine Lab → start render test tone (low gain, e.g. 0.05)
5. Enable DSP
6. Enable EQ
7. Move 1 kHz band to +6 dB → audible presence/midrange boost
8. Move 1 kHz band back to 0 → level returns to flat
9. Move 100 Hz band to +8 dB → audible bass increase
10. Enable HPF and LPF → EQ still active between them
11. Start capture meter → enable input DSP + EQ → meter reacts to processed signal
12. Reset to flat → all sliders return to 0, meter returns to unprocessed level
13. Stop engine → no crash / no hang
14. Close app while engine running → no crash
15. Confirm no production EQ / routing / noise / mic claims in UI
16. Confirm Equalizer page is still mock-only (does not call any Tauri DSP commands)

---

# Acceptance Criteria

This task is complete when:

- `dsp/eq.rs` exists with `peaking_eq_coeffs`, constants, and 6 tests
- `DspRuntimeConfig` includes `eq_enabled` and `eq_bands: Vec<EqBandConfig>`
- `DspConfigShared` includes `eq_enabled`, `eq_band_gains[5]`, `eq_band_enabled[5]` atomics
- `DspPipeline` allocates per-channel per-band EQ state in `prepare()`
- `maybe_refresh()` recomputes EQ coefficients when config version changes
- `process_render_mono()` applies EQ bands between HPF and LPF when `eq_enabled`
- `process_capture_sample()` applies per-channel EQ bands between HPF and LPF when `eq_enabled`
- No heap allocation in `process_render_mono` / `process_capture_sample`
- `EqBandConfig` type exists in `src/types/audio-engine.ts`
- `useAudioDsp` default config includes 5 flat EQ bands
- Engine Lab DSP card has EQ Bands subsection with 5 gain sliders
- UI clearly states EQ is test-only
- Equalizer page remains mock-only (unchanged)
- `cargo test` passes (all existing + new EQ tests)
- `cargo check` passes
- `npm run build` passes
- Discovery, Apps, Mixer, Engine Lab start/stop all still work
- No routing / noise / driver / APO / virtual-device / production EQ work added

---

# Final Response Format

When finished, report:

1. What was implemented
2. Files changed
3. How to run and test
4. What EQ processing is real (math applied to real WASAPI samples)
5. Where EQ is applied (render tone only? capture also?)
6. What remains mock/test-only
7. Known limitations
8. Whether all checks passed (cargo test count, cargo check, npm build)
9. Recommended Phase 8 next step

Keep the final response concise and specific.

---

## Very Short Summary

This prompt asks Sonnet to implement Audapp Phase 7B: a 5-band test-only peaking EQ added to the existing DSP foundation inside Audio Engine Lab. It creates `dsp/eq.rs` (RBJ peaking-EQ coefficients), extends the atomic config with per-band gain/enabled arrays, extends the pipeline with preallocated per-channel EQ states, and adds EQ band sliders to the Engine Lab DSP card. The Equalizer page stays mock-only; no routing, noise suppression, or production EQ is added.
