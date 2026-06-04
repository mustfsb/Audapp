# Audapp Phase 18A Recovery Route Intent Report

## 1. Starting rollback state

- Snapshot baseline: `Audapp one-click system routing working - Phase 17A`
- Branch: `main`
- Driver status: healthy
- Device: `ROOT\DEVGEN\AUDAPP12G0001`
- Driver service: `AudioCodec`
- `cargo check`: passed before implementation
- `npm run build`: passed before implementation

## 2. Driver preflight result

- No driver, root-device, `pnputil`, `devcon`, `devgen`, or WDK packaging files were modified.
- Bridge Lab routing commands remained intact during this recovery pass.

## 3. Surviving Phase 18A pieces

- Session discovery remained available through `get_audio_discovery_snapshot`.
- Session mute/volume controls remained available through `set_audio_session_volume` and `set_audio_session_mute`.
- Channel assignment persistence remained available through `assignments.rs`.
- Mixer channel persistence remained available through `mixer_settings.rs`.

## 4. Route intent pieces restored

- Added persisted backend store: `src-tauri/src/audio/session_intents.rs`
- Added Tauri commands:
  - `get_session_route_intents`
  - `set_session_route_intent`
  - `clear_session_route_intent`
- Added frontend types and hook:
  - `src/types/session-view.ts`
  - `src/lib/use-session-route-intents.ts`
- Added Apps route-intent selector and disclaimer copy.
- Added Mixer route-intent display and selector for assigned sessions.

## 5. Files changed

- `src-tauri/src/audio/session_intents.rs`
- `src-tauri/src/audio/mod.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/src/lib.rs`
- `src/types/session-control.ts`
- `src/types/session-view.ts`
- `src/lib/session-target.ts`
- `src/lib/use-session-route-intents.ts`
- `src/app/App.tsx`
- `src/components/apps/apps-view.tsx`
- `src/components/mixer/mixer-view.tsx`

## 6. Build results

- `cargo test session_intents --manifest-path src-tauri\Cargo.toml`: PASS
- `cargo check --manifest-path src-tauri\Cargo.toml`: PASS
- `npm run build`: PASS

## 7. Manual smoke test

- Result: NOT RUN
- Notes:
  - `npm run tauri dev` smoke validation was not executed in this recovery pass.
  - Build-level verification completed successfully.

## 8. Known limitations

- Route intent is still a POC label only.
- No real Windows per-app endpoint reassignment is implemented yet.
- Internal channels are still out of scope.
- Channel rules/persistence follow-up is still out of scope.

## 9. Next recovery step

- Restore Phase 18B internal channels on top of the recovered Phase 18A route-intent layer.
