# Audapp Phase 18B Recovery Internal Channels Report

## 1. Starting rollback / recovery state

- Snapshot baseline: `Audapp one-click system routing working - Phase 17A`
- Working branch during recovery: `main`
- Recovery mode: continue on the current dirty working tree without resets or driver changes
- Preserved baseline before this pass:
  - Phase 17A one-click system routing present
  - Phase 18A session discovery, mute, volume, and route-intent baseline present
  - `cargo check` passed before implementation
  - `npm run build` passed before implementation

## 2. Driver preflight result

- Verified device: `ROOT\DEVGEN\AUDAPP12G0001`
- Friendly name: `Audapp Input`
- Driver state: `Driver is running`
- Class: `MEDIA`
- Service: `AudioCodec`
- ProblemCode: `0`
- Driver INF: `oem19.inf`
- Result: driver and routing baseline stayed healthy; no driver, root-device, `pnputil`, `devcon`, or WDK flow changes were made in this phase

## 3. Phase 18A route-intent baseline confirmation

- `get_session_route_intents`, `set_session_route_intent`, and `clear_session_route_intent` remained wired
- Apps and Mixer route-intent UI remained present
- Route intent was kept separate from the restored internal Audapp channel assignment flow

## 4. Internal channel pieces restored

- Added shared internal channel model for:
  - `general`
  - `music`
  - `voice`
  - `game`
- Added smart-default session classification:
  - `spotify` -> `Audapp Music`
  - `discord`, `teams`, `ms-teams`, `zoom` -> `Audapp Voice`
  - all other identified apps -> `Audapp General`
  - missing identity -> fallback `Audapp General`
- Updated Apps view to:
  - show the four internal Audapp channels
  - keep route intent separate
  - label assignment source as `Manual`, `Smart default`, or `Fallback`
  - show the Phase 18B disclaimer that Windows per-app endpoint routing comes later
- Updated Mixer view to:
  - group sessions by internal Audapp channel
  - count resolved sessions per group, including unassigned sessions that resolve to `Audapp General`
  - apply channel mute and volume to resolved controllable sessions
- Updated persisted mixer-channel validation to accept only the Phase 18B channel ids

## 5. Files changed

- `src/lib/internal-channels.ts`
- `src/lib/channel-workflow.ts`
- `src/lib/channel-workflow.test.ts`
- `src/types/audio.ts`
- `src/data/mock-audio.ts`
- `src/app/App.tsx`
- `src/components/apps/apps-view.tsx`
- `src/components/mixer/mixer-view.tsx`
- `src/components/dashboard/dashboard-view.tsx`
- `src-tauri/src/audio/mixer_settings.rs`

## 6. Build / verification results

- `node --test --experimental-strip-types src\lib\channel-workflow.test.ts`: PASS
- `cargo test mixer_settings --manifest-path src-tauri\Cargo.toml`: PASS
- `cargo check --manifest-path src-tauri\Cargo.toml`: PASS
- `npm run build`: PASS

## 7. Manual smoke test result

- Result: NOT RUN
- Notes:
  - `npm run tauri dev` manual smoke validation was not executed in this pass
  - No live Bridge Lab interaction was performed after implementation

## 8. Known limitations

- Internal channels are still Audapp-local mixer groups only
- No real Windows per-app endpoint reassignment is implemented yet
- Legacy persisted manual assignments that point at older channel ids are ignored by the new resolver until they are reassigned in the UI
- Channel Rules UI remains intentionally out of scope for this phase

## 9. Next recovery step

- Phase 19A recovery: restore channel rules / persistence cleanup / UI cleanup after a manual Phase 18B smoke run in `npm run tauri dev`
