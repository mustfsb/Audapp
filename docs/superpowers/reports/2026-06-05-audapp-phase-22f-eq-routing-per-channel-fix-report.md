# Phase 22F — EQ Routing Fix + Per-Channel EQ

**Date:** 2026-06-08  
**Branch:** main  
**Status:** Complete — build passes, 100 tests pass

---

## 1. Root Cause of Equalizer Gain Not Affecting Audible Output

The multichannel bridge uses `DspPipeline::process_routing_sample()` to apply master DSP to the
summed mix. This function applied `input_gain` but **never applied `output_gain`**:

```rust
// pipeline.rs — process_routing_sample (before fix)
let y = x * self.snapshot.input_gain;  // ← only input_gain applied
// … HP / EQ / LP …
// output_gain was NOT applied here
```

The Equalizer page's "Output Gain" slider writes to `config.outputGainDb` → Rust
`output_gain_db`. The Engine Lab's "Input Gain" writes to `inputGainDb` → `input_gain_db`.

Since the bridge called `process_routing_sample()` which used only `input_gain`, the EQ page's
output gain slider had zero audible effect. The Engine Lab's input gain slider worked because it
wrote to `input_gain_db`, which **was** used in the bridge path.

---

## 2. Negative Gain Fix

The dB-to-linear conversion (`10^(dB/20)`) was already implemented correctly in `gain.rs`. Tests
for negative dB (`−6 dB → ~0.5`) were already passing. The bug was entirely that `output_gain`
was never applied in the routing path — not a formula error.

**Fix:** One line added to `process_routing_sample()` in `pipeline.rs`:

```rust
// After LP filter, before limiter:
let y = y * self.snapshot.output_gain;  // ← ADDED
```

Now output gain is applied after all EQ/filter processing, before the soft limiter. The signal
flow is:

```
input_gain → HP filter → EQ bands → LP filter → output_gain → soft limiter → render
```

Positive dB amplifies, 0 dB = unity, negative dB attenuates.

---

## 3. Per-Channel EQ Backend Model

Added `src-tauri/src/audio_bridge/channel_dsp.rs` — a new module with atomic per-channel DSP
state mirroring the pattern of `runtime_config.rs`.

**Config type:**
```rust
pub struct ChannelDspConfig {
    pub channel_id: String,  // "general" | "music" | "game" | "browser"
    pub enabled: bool,
    pub gain_db: f32,        // clamped to −24..+12 dB
}
```

**Global singleton:** `AllChannelDspState` holds four independent `ChannelDspState` structs, each
with `AtomicBool` (enabled) and `AtomicU32` (gain_db as f32 bits). Lock-free read/write.

**Key public API:**
- `get_channel_dsp(channel_id)` → `Option<ChannelDspConfig>`
- `set_channel_dsp(config)` → `Result<(), String>`
- `get_all_channel_dsps()` → `Vec<ChannelDspConfig>` (all 4 channels)
- `channel_eq_gain_linear(channel_id)` → linear gain multiplier (used by bridge)
- `load_channel_dsp_configs(data_dir)` / `save_channel_dsp_configs(data_dir)` — JSON persistence
- `init_channel_dsp(configs)` — seeds global state from loaded configs

---

## 4. Multichannel Bridge DSP Path Changes

`multichannel_worker.rs` mixing loop updated to apply per-channel EQ gain before mixing:

```rust
// Before (volume only):
let gain = channel_gain_linear(source.channel_id).unwrap_or(1.0);

// After (volume × per-channel EQ gain):
let vol_gain = channel_gain_linear(source.channel_id).unwrap_or(1.0);
let eq_gain = super::channel_dsp::channel_eq_gain_linear(source.channel_id);
let total_gain = vol_gain * eq_gain;
```

The complete signal chain per channel is now:

```
[Source capture]
    → per-channel vol_gain (volume slider, mute)
    × per-channel eq_gain  (EQ gain slider, new)
    → summed into render_out
[After summing all 4 channels]
    → master DSP pipeline (input_gain → HP → EQ → LP → output_gain → limiter)
    → physical output
```

Mute still works: muted channels return `vol_gain = 0.0`, so `total_gain = 0.0`, and the mixing
loop skips them (optimization preserved).

---

## 5. Equalizer UI Changes

`src/components/eq/equalizer-view.tsx` rewritten:

- **Channel selector** at the top: `[General] [Music] [Game] [Browser]` segmented buttons
- **"Editing [Channel] channel"** label below selector
- **`ChannelGainSection`** component: per-channel output gain slider (−24..+12 dB, 0.5 step),
  driven by new `useChannelDsp(channelId)` hook
- **Master DSP section** (`DspControls`) below — unchanged functionality, updated footer note

New `src/lib/use-channel-dsp.ts` hook:
- Fetches config via `get_channel_dsp_config` Tauri command on mount and on channel change
- Throttled setGainDb (100ms) + immediate commitGainDb, matching the pattern of `use-audio-dsp.ts`
- Cancels pending throttle when channel changes to prevent cross-channel writes

---

## 6. Persistence and Migration

Per-channel DSP configs are saved to `channel-dsp-config.json` in the app local data directory,
using the same atomic write (tmp → rename) pattern as other config files.

- Schema version 1; unknown versions fall back to defaults
- Missing channels in the file are filled with defaults (forward-compatible)
- App startup (`lib.rs` setup) loads and initializes channel DSP configs alongside mixer settings
- Default for all channels: `enabled=true, gain_db=0.0` (unity, no change to audio)

No migration needed from previous schema — this is a new file; all channels default to 0 dB.

---

## 7. New Tauri Commands

Added to `bridge_commands.rs`:

| Command | Input | Output |
|---|---|---|
| `get_channel_dsp_config` | `channelId: String` | `Result<ChannelDspConfig, String>` |
| `set_channel_dsp_config` | `config: ChannelDspConfig` | `Result<(), String>` |
| `get_all_channel_dsp_configs` | — | `Vec<ChannelDspConfig>` |

All three registered in `lib.rs` invoke_handler.

---

## 8. Tests / Build Results

**Cargo tests:** 100 passed, 0 failed

New tests in `audio_bridge::channel_dsp::tests`:
- `default_gain_is_unity` — 0 dB → linear 1.0
- `zero_db_is_unity` — explicit 0 dB set → 1.0
- `negative_db_attenuates` — −12 dB < 1.0 and > 0.0
- `positive_db_amplifies` — +6 dB > 1.0
- `disabled_returns_unity_regardless_of_gain_db` — disabled EQ → 1.0 even at −12 dB
- `updating_browser_does_not_affect_music` — channel isolation verified
- `all_four_channels_have_defaults` — all four channels exist with unity default
- `load_missing_file_returns_all_four_defaults` — graceful missing-file handling
- `save_then_load_roundtrip` — persistence roundtrip for all 4 channels

**Frontend build:** ✓ 1927 modules, 0 TS errors

---

## 9. Manual Smoke Checklist Status

Not yet confirmed — user must verify on the running host:

```
[ ] App opens on host
[ ] Audio routes through Audapp channels
[ ] Equalizer page shows channel selector: General/Music/Game/Browser
[ ] Select Browser → "Editing Browser channel" label shown
[ ] Play browser audio → increase Browser gain → audio louder
[ ] Decrease Browser gain below 0 dB → audio quieter
[ ] Select Music → Music settings independent of Browser settings
[ ] Music gain changes affect Music source only
[ ] Simultaneous Browser + Music playback works
[ ] Master limiter prevents harsh clipping at high gain
[ ] Engine Lab / Developer Mode no longer needed for basic output gain
[ ] No crash or stutter
```

---

## 10. Files Changed

| File | Change |
|---|---|
| `src-tauri/src/audio_engine/dsp/pipeline.rs` | +1 line: apply `output_gain` in `process_routing_sample` |
| `src-tauri/src/audio_bridge/channel_dsp.rs` | **NEW** — per-channel DSP state, persistence, tests |
| `src-tauri/src/audio_bridge/mod.rs` | Expose `channel_dsp` as public module |
| `src-tauri/src/audio_bridge/multichannel_worker.rs` | Apply per-channel EQ gain in mix loop |
| `src-tauri/src/bridge_commands.rs` | +3 Tauri commands for channel DSP |
| `src-tauri/src/lib.rs` | Register commands; init channel DSP on startup |
| `src/lib/use-channel-dsp.ts` | **NEW** — per-channel DSP React hook |
| `src/components/eq/equalizer-view.tsx` | Rewritten with channel selector + per-channel gain |
| `src/types/audio-engine.ts` | Add `ChannelDspConfig` type |

---

## 11. Known Limitations

1. **Per-channel EQ bands not yet implemented.** Only per-channel gain (dB) is applied before
   mixing. The master DSP chain (EQ bands, HP/LP filters) still applies globally after summing.
   Per-channel biquad EQ would require four separate `DspPipeline` instances in the bridge —
   feasible in the next phase.

2. **EQ page does not show per-channel EQ bands per channel.** The 5-band EQ in the master DSP
   section applies to all channels equally.

3. **"Enable DSP" toggle required for master output gain.** The master DSP output gain slider is
   still gated behind the "Enable DSP" switch in the master section. Per-channel gain (new) always
   applies regardless of master DSP toggle.

4. **Limiter is master-only.** Clipping protection is applied once, after summing. High per-channel
   gains on multiple simultaneous sources can exceed limiter threshold collectively.

---

## 12. Next Phase Recommendation

**Phase 22G — Per-Channel EQ Bands:**

- Create one `DspPipeline` per source channel in `multichannel_worker`
- Each pipeline reads from a per-channel config (extending `ChannelDspConfig` with EQ bands)
- Apply per-channel pipeline to source buffer before summing
- Expose per-channel EQ bands in the Equalizer page `ChannelGainSection`
- Add per-channel EQ presets (flat, music, gaming, etc.)
- Keep master DSP as final post-mix stage

This is the next logical step to complete the per-channel EQ product promise.
