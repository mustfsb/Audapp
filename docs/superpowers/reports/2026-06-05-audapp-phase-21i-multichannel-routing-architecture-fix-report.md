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

---

# Phase 21I — Pass 2 Runtime Fix (2026-06-05)

Pass 1 built/tested clean, but live smoke surfaced two runtime bugs. Pass 2 hardens the
render-output path and the manual per-app assignment path. Work done on `main`; nothing
committed/pushed. App-side Rust/Tauri + frontend only; no driver mutation.

## Preflight (read-only)

- Branch `main`, clean tree (only untracked reports/specs). AudappChannels 4 devnodes
  `ProblemCode 0` (Service `AudappChannels`); Audapp Input `ProblemCode 0`, `oem19.inf`.
- `Get-PnpDevice -Class AudioEndpoint`: the **only** non-Audapp render endpoint is
  `Hoparlör (High Definition Audio Device)`.
- `audapp_session_probe`: only live session was `System Sounds` on the Audapp Input device
  id — confirming the current Windows default render is **Audapp Input**.

## Bug 1 — no audible output unless default is Audapp Browser

Root causes (code-level):

1. **No robust physical-output resolver.** Output was chosen by
   `physical_outputs.find(is_default).or(first())` — no priority, no fail-closed, Audapp
   exclusion by friendly name only. On this box (default = Audapp Input) it fell back to an
   arbitrary `first()`.
2. **Restore target could become Audapp Input.** `choose_restore_target` returned the
   current default verbatim when that id was absent from the discovery snapshot, so a
   restore could set the Windows default back to Audapp Input (silence).
3. **No honest status** to localize the live render device (`defaultRender*` /
   `isPhysicalOutputAudapp` did not exist).

Fixes:

- New pure `resolve_physical_output_candidate(devices, saved_selected, previous_restore,
  current_default)` (`audio_bridge/endpoints.rs`) with priority saved → previous → default
  → first active non-Audapp, fail-closed otherwise. Audapp exclusion checks **both** the
  `is_audapp_endpoint` boolean **and** the friendly name (`is_audapp_render_device`).
- `build_routing_enable_plan` now resolves the physical output first, builds the config
  against it, then sets default → Audapp General, then starts the bridge. `routing_enable`
  + `routing_auto_start` thread saved-selected/previous-restore ids; the standalone Bridge
  Lab start also routes through the resolver.
- `choose_restore_target` keeps the current default only when confirmed active non-Audapp;
  otherwise restores to the resolved physical output — **never** an Audapp endpoint.
- Status honesty: `MultichannelOutputStatus` gains `default_render_id/name` +
  `is_physical_output_audapp`; the worker reads the live Windows default and raises a
  `last_error` tripwire if the render output ever resolves to an Audapp endpoint.

**Physical output is now guaranteed non-Audapp by construction** — every selection path
returns only an active, non-Audapp output or fails closed.

## Bug 2 — msedge Browser → General did not stick

The resolver priority (manual → rule → smart default → fallback) was already correct
(passing test) and the match round-trips for a normal Win32 process. The gap was the
missing **optimistic UI update**: the Channel dropdown is derived from persisted
assignments only, so it appeared to snap back to the Browser smart default during the
async round-trip.

Fix: extracted the matcher to `src/lib/channel-assignment-match.ts`; `setAssignmentForSession`
now optimistically upserts the assignment locally (keyed by the same match tuple the
backend dedupes on), reconciles with the persisted record, and rolls back on error.
Matching prefers stable identifiers (exe path / process name) so the override survives
Edge's audio-pid churn across refreshes.

UI honesty: Bridge Lab shows render device vs Windows default (+ amber warning if the
output is ever Audapp); Apps notes that changing the channel updates the requested grouping
only and the actual Windows endpoint is moved in Volume Mixer.

## Verification (Pass 2)

- `cargo check` (manifest `src-tauri/Cargo.toml`): exit 0 (pre-existing warnings only).
- `cargo test --lib`: **91 passed, 0 failed**.
- `node --test src/lib/*.test.ts`: **42 passed, 0 failed**.
- `npm run build` (`tsc && vite build`): exit 0, 1923 modules.

New Rust tests: resolver rejects Audapp Input/General/Music/Game/Browser as saved or
default, rejects Audapp with a stale boolean flag, honors saved→previous→default priority,
skips inactive saved output, fails closed when only Audapp endpoints exist; restore target
stays physical when default is Audapp or missing from the snapshot.
New TS tests: manual msedge→general beats browser, reset returns to browser, persists
across pid change, matches on process name alone, optimistic upsert by identity.

## Manual smoke status (Pass 2)

**Not run / not confirmed.** The new honest-status fields are intended to make this smoke
diagnostic — in Bridge Lab, "Render device" must be the physical HD Audio device and the
amber Audapp-output warning must not appear, even with the Windows default on Audapp
Input/General.

## Files changed (Pass 2)

Rust: `audio_bridge/endpoints.rs`, `audio_bridge/mod.rs`,
`audio_bridge/multichannel_manager.rs`, `audio_bridge/multichannel_types.rs`,
`audio_bridge/multichannel_worker.rs`, `audio_policy/manager.rs`.
Frontend: `lib/channel-assignment-match.ts` (new), `lib/channel-assignment-match.test.ts`
(new), `lib/use-channel-assignments.ts`, `lib/use-multichannel-bridge.ts`,
`types/bridge.ts`, `components/bridge/bridge-lab-view.tsx`, `components/apps/apps-view.tsx`.

## Git status (Pass 2)

On `main`, nothing committed. The files above are modified/untracked; this report updated
in place.
