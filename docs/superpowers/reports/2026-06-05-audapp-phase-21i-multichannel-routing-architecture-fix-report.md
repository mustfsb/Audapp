# Audapp - Phase 21I Multi-Channel Routing Architecture Fix Report

Date: 2026-06-05
Thread: Audapp - Phase 21I Multi-Channel Routing Architecture

## Summary

Phase 21I Pass 1 replaces the product-facing routing path that previously behaved like a
single-source `Audapp Input` bridge with a real four-source multi-channel bridge model:

- `Audapp General`
- `Audapp Music`
- `Audapp Game`
- `Audapp Browser`

The bridge now resolves those four endpoints exactly, mixes them simultaneously to a
selected physical output, keeps per-channel gain/mute in runtime memory, auto-starts
safely on app open when validation passes, and restores the previous Windows default on
disable or shutdown.

The old `Audapp Input` bridge remains available only as a legacy diagnostic path.

## Core Fixes

### 1. Exact endpoint resolution

Added exact, order-independent Audapp endpoint resolution in:

- `src-tauri/src/audio_bridge/endpoints.rs`

This removes product-path dependence on a generic `"audapp"` substring match and ensures:

- `Audapp Browser` is never treated as the legacy virtual input
- all four AudappChannels outputs are resolved independently
- multichannel startup fails closed when one required channel is missing

### 2. New multichannel backend

Added the new bridge backend in:

- `src-tauri/src/audio_bridge/multichannel_types.rs`
- `src-tauri/src/audio_bridge/multichannel_manager.rs`
- `src-tauri/src/audio_bridge/multichannel_worker.rs`

The new worker owns:

- four simultaneous loopback capture clients
- one physical render client
- per-source buffering / resampling
- post-sum master DSP metrics
- per-channel runtime gain/mute reads

Status now reports four fixed source channels:

- `general`
- `music`
- `game`
- `browser`

### 3. Runtime mixer config

Added runtime mixer state in:

- `src-tauri/src/audio_bridge/runtime_config.rs`

Integrated it so that:

- app setup seeds runtime state from persisted mixer settings
- `set_mixer_channel_setting` persists to disk and updates runtime state immediately
- `reset_mixer_channel_settings` also resets bridge runtime state
- the multichannel worker reads gain/mute without doing file I/O

### 4. Routing lifecycle rewrite

Reworked routing policy in:

- `src-tauri/src/audio_policy/manager.rs`
- `src-tauri/src/audio_policy/types.rs`
- `src-tauri/src/audio_policy/mod.rs`

Behavior now matches the approved product model:

- enable validates all four AudappChannels outputs
- enable rejects Audapp endpoints as the physical output target
- enable stores a physical restore target
- enable sets Windows default render to `Audapp General`
- enable starts the multichannel bridge
- disable stops the multichannel bridge and restores the previous default
- startup auto-starts only when validation succeeds
- shutdown performs best-effort bridge stop + default restore

### 5. Commands / DTOs

Added multichannel command surface in:

- `src-tauri/src/bridge_commands.rs`
- `src-tauri/src/lib.rs`

New commands:

- `get_multichannel_bridge_status`
- `list_multichannel_bridge_candidates`
- `start_multichannel_bridge`
- `stop_multichannel_bridge`

### 6. Frontend honesty + UX updates

Updated UI in:

- `src/components/bridge/bridge-lab-view.tsx`
- `src/components/mixer/mixer-view.tsx`
- `src/components/apps/apps-view.tsx`
- `src/components/devices/devices-view.tsx`
- `src/lib/use-multichannel-bridge.ts`
- `src/lib/session-routing-honesty.ts`
- `src/types/bridge.ts`
- `src/types/routing.ts`

Key UX changes:

- Bridge Lab now leads with **Always-On Multi-Channel Bridge**
- shows all four channels simultaneously with availability / counters / meters
- shows physical output and Windows default honestly as `Audapp General` during routing
- moves the old single-source bridge into **Legacy Audapp Input Bridge**
- Mixer / Apps explicitly separate:
  - requested Audapp channel
  - actual Windows endpoint

No UI now implies that internal Audapp assignment alone moved a Windows app endpoint.

## Tests Added / Updated

Rust:

- `audio_bridge::endpoints` tests:
  - Browser never classified as legacy input
  - endpoint resolution is order-independent
  - missing channel is reported
- `audio_bridge::multichannel_manager` tests:
  - startup chooses `Audapp General`
  - missing required channel is rejected
  - Audapp endpoint cannot be selected as physical output
- `audio_bridge::multichannel_types` test:
  - default status always contains `general/music/game/browser`
- `audio_bridge::runtime_config` tests:
  - runtime state seeds from persisted settings
  - runtime gain/mute updates immediately

TypeScript:

- `src/lib/session-routing-honesty.test.ts`
  - requested channel and actual Windows endpoint are kept distinct

## Verification Run

Completed:

- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --lib`
- `node --test src/lib/*.test.ts`
- `npm run build`

Observed results:

- `cargo test --lib`: **84 passed, 0 failed**
- `node --test src/lib/*.test.ts`: **36 passed, 0 failed**
- `npm run build`: **passed**

## Manual Runtime Smoke

Not claimed as passed.

I did **not** run or claim the manual end-to-end Windows audio smoke checklist from the
approved build prompt. That still requires a real runtime session and user confirmation,
especially for:

- startup auto-routing behavior
- simultaneous Browser + Music playback
- per-channel mute behavior on live audio
- Windows default restore on app close

## Safety Notes

- No driver install / remove / mutation commands were used.
- No `pnputil`, `devcon`, `devgen`, or INF changes were performed.
- Existing `Audapp Input` was preserved as a legacy diagnostic path.
