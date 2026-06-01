# Audapp — Phase 7A: Peaking EQ / Multi-Band EQ Foundation Plan

**Date:** 2026-05-30
**Status:** Approved — ready for Phase 7B implementation by Sonnet 4.6

---

## 1. Phase 6B Status (Verified)

Phase 6B is complete on `main` (commit `a35565a`). All checks green:

```
cargo test  19/19 passed
cargo check passed
npm run build passed
```

### What Phase 6B delivered

`src-tauri/src/audio_engine/dsp/` contains 7 files:

| File | What it provides |
|---|---|
| `biquad.rs` | `BiquadCoeffs` (Copy, IDENTITY const), `BiquadState` (Copy, Default), Direct Form II Transposed `process()`, denormal flush < 1e-30 |
| `filters.rs` | `lowpass_coeffs`, `highpass_coeffs` (RBJ cookbook, Butterworth Q=0.7071068), `clamp_cutoff` |
| `gain.rs` | `db_to_linear`, `clamp_gain_db` (-24..+12 dB) |
| `config.rs` | `OnceLock<DspConfigShared>` with atomics, `get/set/reset_config`, `get_status` |
| `pipeline.rs` | `DspPipeline` — `prepare`, `maybe_refresh` (once per buffer cycle), `process_render_mono`, `process_capture_sample` |
| `types.rs` | `DspRuntimeConfig`, `DspRuntimeStatus` (serde camelCase) |
| `mod.rs` | `pub use` of all public API |

**Current `DspConfigShared` atomics:** `enabled`, `output_gain_db`, `input_gain_db`, `high_pass_enabled`, `high_pass_hz`, `low_pass_enabled`, `low_pass_hz`, `version`, `active_in_engine`, `supported`, `unsupported_reason_idx`, `sample_format_tag`.

**Current signal chain:** `gain → HPF → LPF` (both render mono and per-channel capture).

**Frontend:** `DspRuntimeConfig` + `DspRuntimeStatus` types, `useAudioDsp` hook (throttled writes + commitConfig), DSP/EQ Test card in Engine Lab. Equalizer page is mock-only — confirmed.

No blockers for Phase 7B.

---

## 2. Phase 7B Goal

Add 5-band peaking EQ processing to the existing DSP pipeline — still test-only, still Engine-Lab-only. The biquad primitive is already written; the goal is to prove peaking-EQ arithmetic works on real WASAPI samples before wiring a production EQ page.

**Final signal chain after Phase 7B:**
```
gain → HPF → [EQ band 0: 100 Hz] → [EQ band 1: 250 Hz] → [EQ band 2: 1 kHz]
    → [EQ band 3: 4 kHz] → [EQ band 4: 10 kHz] → LPF
```
Applies to: render test tone (mono chain) and capture meter/null (per-channel chain).

---

## 3. EQ Architecture

### 3.1 New file: `src-tauri/src/audio_engine/dsp/eq.rs`

Responsibilities: peaking-EQ coefficient generation, fixed band definitions, per-band gain clamp.

```rust
use std::f32::consts::PI;
use super::biquad::BiquadCoeffs;
use super::filters::clamp_cutoff;

pub const NUM_EQ_BANDS: usize = 5;
pub const EQ_FREQUENCIES: [f32; NUM_EQ_BANDS] = [100.0, 250.0, 1000.0, 4000.0, 10000.0];
pub const EQ_GAIN_MIN_DB: f32 = -12.0;
pub const EQ_GAIN_MAX_DB: f32 = 12.0;
pub const EQ_Q: f32 = 1.0;  // fixed, not exposed in UI for Phase 7B

pub fn clamp_eq_gain_db(db: f32) -> f32 {
    db.clamp(EQ_GAIN_MIN_DB, EQ_GAIN_MAX_DB)
}

/// RBJ cookbook peaking EQ coefficients.
/// Returns BiquadCoeffs::IDENTITY when abs(gain_db) < 0.01 (no-op shortcut).
pub fn peaking_eq_coeffs(fc: f32, fs: f32, gain_db: f32, q: f32) -> BiquadCoeffs {
    if gain_db.abs() < 0.01 {
        return BiquadCoeffs::IDENTITY;
    }
    let fc = clamp_cutoff(fc, fs);
    let q = q.max(0.1);
    let a = 10.0_f32.powf(gain_db / 40.0);  // sqrt(10^(gain_db/20))
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

**Tests required:**
1. `peaking_eq_coefficients_finite` — all 5 fields finite for boost and cut
2. `peaking_eq_dc_gain_near_unity` — `(b0+b1+b2)/(1+a1+a2) ≈ 1.0` (peaking EQ DC invariant)
3. `peaking_eq_nyquist_gain_near_unity` — `(b0-b1+b2)/(1-a1+a2) ≈ 1.0`
4. `peaking_eq_zero_gain_returns_identity` — 0.0 dB → IDENTITY
5. `peaking_eq_no_panic_degenerate_fs` — `peaking_eq_coeffs(1000.0, 1.0, 6.0, 1.0).b0.is_finite()`
6. `clamp_eq_gain_db_clamps` — values outside -12..+12 are clamped

### 3.2 `dsp/types.rs` changes

Add:
```rust
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EqBandConfig {
    pub id: String,           // "band_100hz", "band_250hz", etc.
    pub frequency_hz: f32,    // informational, matches fixed EQ_FREQUENCIES
    pub gain_db: f32,         // -12..+12 dB
    pub enabled: bool,
}

// Extend DspRuntimeConfig with:
pub eq_enabled: bool,             // default: false
pub eq_bands: Vec<EqBandConfig>,  // default: 5 bands, gain=0, enabled=true
```

Default for `eq_bands`: construct from `EQ_FREQUENCIES` with `gain_db=0.0`, `enabled=true`, `id=format!("band_{}hz", freq as u32)`.

**Note:** `DspRuntimeConfig` must implement `Default` explicitly (or have a constructor) since `Vec` needs the 5 entries. The `#[derive(Default)]` on the struct is insufficient for the bands field — write an explicit `impl Default`.

### 3.3 `dsp/config.rs` changes

**DspConfigShared** gains:
```rust
eq_enabled: AtomicBool,
eq_band_gains: [AtomicU32; 5],    // f32 bits, init 0_f32.to_bits()
eq_band_enabled: [AtomicBool; 5], // init true
```

`[AtomicU32; 5]` and `[AtomicBool; 5]` do not implement Default. Initialize each element explicitly in the `OnceLock` init closure:

```rust
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

**`set_config` update:**
```rust
shared.eq_enabled.store(config.eq_enabled, Ordering::Relaxed);
for (i, band) in config.eq_bands.iter().enumerate().take(NUM_EQ_BANDS) {
    shared.eq_band_gains[i].store(clamp_eq_gain_db(band.gain_db).to_bits(), Ordering::Relaxed);
    shared.eq_band_enabled[i].store(band.enabled, Ordering::Relaxed);
}
```

**`get_config` update:**
```rust
let eq_bands: Vec<EqBandConfig> = (0..NUM_EQ_BANDS).map(|i| EqBandConfig {
    id: format!("band_{}hz", EQ_FREQUENCIES[i] as u32),
    frequency_hz: EQ_FREQUENCIES[i],
    gain_db: f32::from_bits(shared.eq_band_gains[i].load(Ordering::Relaxed)),
    enabled: shared.eq_band_enabled[i].load(Ordering::Relaxed),
}).collect();
```

**`reset_config`**: resets eq_band_gains to 0.0, eq_band_enabled to true, eq_enabled to false (via `set_config(DspRuntimeConfig::default())`).

### 3.4 `dsp/pipeline.rs` changes

**DspSnapshot** gains `eq_enabled: bool`.

**DspPipeline** gains:
```rust
out_eq_states: [BiquadState; 5],     // init [BiquadState::default(); 5]
out_eq_coeffs: [BiquadCoeffs; 5],    // init [BiquadCoeffs::IDENTITY; 5]
in_eq_states: Vec<[BiquadState; 5]>, // allocated in prepare()
in_eq_coeffs: [BiquadCoeffs; 5],     // init [BiquadCoeffs::IDENTITY; 5]
```

**`prepare()` update:**
```rust
self.in_eq_states = vec![[BiquadState::default(); 5]; channels.max(1)];
```
(One-time allocation before the audio loop — fine.)

**`maybe_refresh()` update (at end of existing coeff-recompute block):**
```rust
let eq_enabled = shared.eq_enabled.load(Ordering::Relaxed);
self.snapshot.eq_enabled = eq_enabled;
for i in 0..NUM_EQ_BANDS {
    let gain_db = f32::from_bits(shared.eq_band_gains[i].load(Ordering::Relaxed));
    let band_enabled = shared.eq_band_enabled[i].load(Ordering::Relaxed);
    let c = if band_enabled && gain_db.abs() > 0.01 {
        peaking_eq_coeffs(EQ_FREQUENCIES[i], self.sample_rate, gain_db, EQ_Q)
    } else {
        BiquadCoeffs::IDENTITY
    };
    self.out_eq_coeffs[i] = c;
}
self.in_eq_coeffs = self.out_eq_coeffs;
// Note: EQ states NOT reset — natural settling into new coefficients.
```

**`process_render_mono()` update:**
```rust
let y = x * self.snapshot.output_gain;
let hp = self.out_hp_coeffs;
let lp = self.out_lp_coeffs;
let mut y = self.out_hp.process(y, &hp);
if self.snapshot.eq_enabled {
    for i in 0..NUM_EQ_BANDS {
        let c = self.out_eq_coeffs[i];
        y = self.out_eq_states[i].process(y, &c);
    }
}
self.out_lp.process(y, &lp)
```

**`process_capture_sample()` update:**
```rust
let y = x * self.snapshot.input_gain;
let hp = self.in_hp_coeffs;
let lp = self.in_lp_coeffs;
let mut y = self.in_hp_states[ci].process(y, &hp);
if self.snapshot.eq_enabled {
    for i in 0..NUM_EQ_BANDS {
        let c = self.in_eq_coeffs[i];
        y = self.in_eq_states[ci][i].process(y, &c);
    }
}
self.in_lp_states[ci].process(y, &lp)
```

### 3.5 `dsp/mod.rs` update

Add `pub mod eq;` and re-export constants:
```rust
pub mod eq;
pub use eq::{NUM_EQ_BANDS, EQ_FREQUENCIES};
```

---

## 4. Peaking EQ Formula Reference (RBJ Cookbook)

```
A  = 10^(dBgain/40)           (= sqrt(linear gain))
w0 = 2π × fc / fs
cos_w0 = cos(w0)
sin_w0 = sin(w0)
alpha = sin_w0 / (2 × Q)

Peaking EQ (boost/cut at fc):
  b0 =   1 + alpha × A
  b1 =  -2 × cos_w0
  b2 =   1 - alpha × A
  a0 =   1 + alpha / A
  a1 =  -2 × cos_w0
  a2 =   1 - alpha / A
  → normalize all by a0
```

**Key properties:**
- DC gain H(z=1) = (b0+b1+b2)/(1+a1+a2) = 1.0 always (numerator and denominator cancel)
- Nyquist gain H(z=-1) = 1.0 always
- At center frequency, magnitude ≈ 10^(dBgain/20) (the boost/cut)
- When gain_db=0: A=1 → b0/a0=1, b1=a1, b2=a2 → identity transfer function

---

## 5. Real-Time Safety

The EQ hot path (inside `process_render_mono` / `process_capture_sample`) must not:

- Allocate heap memory (all states preallocated in `prepare()`)
- Log or print
- Access filesystem, network, or Tauri
- Call async/await
- Lock any mutex
- Format strings
- Read atomics per-sample (config read once per buffer cycle in `maybe_refresh()`)
- Call transcendental math per-sample (sin/cos/pow only in `maybe_refresh()` when coefficients change)

Allowed hot-path operations:
- Multiply-accumulate (biquad: ~5 FMAs per sample per band)
- Array index access
- Conditional `if eq_enabled` branch (branch-predicted well)
- Denormal flush check `< 1e-30`

**CPU impact estimate:** 5 EQ bands × ~5 FMAs/sample = 25 additional FMAs per sample. At 48 kHz stereo with 256-frame buffers: ~24,000 FMAs per buffer cycle. Negligible on modern hardware (< 0.01% CPU).

---

## 6. Tauri Command Contract

No new Tauri commands needed. The existing 4 commands handle extended config:

```
get_dsp_config()         -> DspRuntimeConfig   (now includes eq_enabled, eq_bands)
set_dsp_config(config)   -> DspRuntimeStatus   (clamps eq band gains, bumps version)
reset_dsp_config()       -> DspRuntimeConfig   (resets EQ to flat)
get_dsp_status()         -> DspRuntimeStatus   (unchanged)
```

---

## 7. TypeScript Type Plan

### `src/types/audio-engine.ts`

```ts
export type EqBandConfig = {
  id: string;           // "band_100hz", "band_250hz", "band_1000hz", "band_4000hz", "band_10000hz"
  frequencyHz: number;  // 100, 250, 1000, 4000, 10000 (informational, set by backend)
  gainDb: number;       // -12..+12
  enabled: boolean;
};

// DspRuntimeConfig additions (append to existing type):
eqEnabled: boolean;
eqBands: EqBandConfig[];
```

### `src/lib/use-audio-dsp.ts`

Add to `DEFAULT_DSP_CONFIG`:
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

No other changes to the hook logic — the existing throttled setConfig + commitConfig handles the extended config naturally.

---

## 8. Frontend Integration Plan (Engine Lab only)

**File:** `src/components/engine/engine-lab-view.tsx`

Add an **EQ Bands** subsection inside the existing "DSP / EQ Test" card, after the HPF/LPF controls and before the Reset button.

Controls:
1. **EQ Enable** — Switch toggle; disables/enables entire EQ section
2. **5 band gain sliders** arranged in a row or grid:
   - "100 Hz", "250 Hz", "1 kHz", "4 kHz", "10 kHz"
   - Range: -12..+12 dB, step: 0.5
   - All disabled when DSP is off or EQ is off
   - Use `onValueChange` → `dsp.setConfig(...)` (throttled), `onValueCommit` → `dsp.commitConfig(...)` (immediate)
3. Existing Reset button resets all including EQ bands.

**Mandatory copy** (add below the HPF/LPF section, above Reset):
> "EQ bands are test-only and apply only to Audio Engine Lab streams. They do not process app audio, routed channels, microphone enhancement, or system output yet."

**No graph visualizer** in Phase 7B.

**Equalizer page:** remains mock-only — do not touch `src/components/eq/equalizer-view.tsx`.

---

## 9. Phase 7B Implementation Checklist

1. Confirm Phase 6B tests still pass before changes
2. Create `dsp/eq.rs` with `peaking_eq_coeffs`, constants, clamp helper, 6 tests
3. Add `pub mod eq;` to `dsp/mod.rs`, re-export `NUM_EQ_BANDS` and `EQ_FREQUENCIES`
4. Extend `dsp/types.rs`: add `EqBandConfig` struct, add `eq_enabled` and `eq_bands` to `DspRuntimeConfig`, implement explicit `Default` for `DspRuntimeConfig`
5. Extend `dsp/config.rs`: add `eq_enabled`, `eq_band_gains`, `eq_band_enabled` atomics to `DspConfigShared`; update `set_config`, `get_config`, `reset_config` for EQ fields
6. Extend `dsp/pipeline.rs`: add EQ fields to `DspSnapshot` and `DspPipeline`, update `new()`, `prepare()`, `maybe_refresh()`, `process_render_mono()`, `process_capture_sample()`
7. Run `cargo test` — all existing tests must pass, new eq.rs tests must pass
8. Run `cargo check`
9. Add `EqBandConfig` to `src/types/audio-engine.ts`, extend `DspRuntimeConfig`
10. Add default EQ bands to `DEFAULT_DSP_CONFIG` in `src/lib/use-audio-dsp.ts`
11. Add EQ Bands UI subsection to Engine Lab DSP card in `engine-lab-view.tsx`
12. Run `npm run build`
13. Smoke test: render test tone → enable DSP + EQ → move 1 kHz band → audible change

---

## 10. Risks and Deferrals

### Risks

| Risk | Mitigation |
|---|---|
| Gain stacking: 5 bands × +12 dB = potential clipping | Output gain slider can compensate; note in UI that stacking boosts loudly |
| Coefficient instability near Nyquist | `clamp_cutoff` already guards this; 10 kHz at 44100 Hz fs is safe |
| `[AtomicU32; 5]` initialization boilerplate | Initialize each element explicitly in OnceLock init closure |
| `Vec<[BiquadState; 5]>` allocation in prepare() | This is before the audio loop — one-time, not per-sample |
| UI implying production EQ | Mandatory test-only copy required; Equalizer page must stay mock |
| Config update race | Atomic version check in maybe_refresh handles this correctly |
| Mutable `y` in process_render_mono | Change `let y = ...` to `let mut y = ...` before the EQ loop |

### Deferrals

- 10-band graphic EQ
- Per-band Q UI
- Parametric EQ with adjustable Q and frequency per band
- Production Equalizer page wiring
- System-wide EQ or per-app EQ
- Mic enhancement chain
- Noise suppression (RNNoise, SpeexDSP)
- Compressor / limiter / gate
- Per-channel routed DSP
- Virtual audio devices, drivers, APOs
- Preset system
- EQ visualization (frequency response graph)
- Sample-rate conversion, exclusive mode

---

## 11. Verification Plan

### Automated

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
npm run build
```

Expected: all existing 19 tests pass + new eq.rs tests pass (≥6 new tests).

### Manual smoke tests (Windows, `npm run tauri dev`)

1. Start Audapp — discovery still works
2. Apps volume/mute still works
3. Mixer group controls still work
4. Open Audio Engine Lab → start render test tone (low gain)
5. Enable DSP
6. Enable EQ
7. Move 1 kHz band slider to +6 dB → audible presence boost
8. Move 100 Hz band to +8 dB → audible bass increase
9. Enable HPF at 80 Hz → low rumble cut, EQ still active
10. Enable LPF at 12000 Hz → high-frequency roll-off, EQ still active
11. Move 10 kHz band → still audible effect below LPF cutoff
12. Start capture meter → input gain + EQ → meter reacts to EQ-processed signal
13. Reset to flat → all sliders return to 0
14. Stop engine → no crash/hang
15. Confirm no production EQ/routing/noise/mic claims in UI
