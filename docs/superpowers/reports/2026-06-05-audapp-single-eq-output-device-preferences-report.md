# Audapp Single EQ + Output Device Preferences Report

## 1. Equalizer duplicate-panel fix

- Reworked the Equalizer page into a single visible channel EQ workflow.
- Added a top-level channel selector for `General`, `Music`, `Game`, and `Browser`.
- Removed the second always-visible master DSP panel from the normal page flow.
- Moved master protection controls into a collapsed `Advanced output protection` section.

## 2. Output gain range change

- Updated the visible output gain slider range to `-24 dB` through `+24 dB`.
- Updated backend gain clamping and persisted config loading to honor `+24 dB`.
- Verified the gain conversion continues to use `10^(dB / 20)`, including negative attenuation.

## 3. Preset dropdown visual changes

- Added a dedicated softer preset trigger/content style for the Equalizer page.
- Increased radius, reduced visual weight, and moved the preset selector onto a lighter card-toned surface.
- Kept the generic select component intact for the rest of the app while styling the EQ preset control directly.

## 4. Full per-channel EQ status

- Confirmed the multichannel bridge already applies real per-channel DSP before mix in `multichannel_worker.rs`.
- Kept the per-channel DSP path fully independent per channel:
  - enabled state
  - output gain
  - limiter state
  - HPF/LPF
  - preset
  - EQ bands
- Equalizer UI now edits the selected channel only.

## 5. Audio path changes

- Preserved the actual DSP order:
  - source channel audio
  - channel DSP
  - channel volume/mute
  - mix
  - master safety limiter/output protection
- Kept master protection available only in the collapsed advanced section to avoid duplicate EQ panels.

## 6. Output preference config model

- Added persisted output preference storage for:
  - primary output
  - fallback output
- Stored:
  - endpoint id
  - friendly name
  - last seen timestamp
- Added Rust persistence tests for load/save behavior.

## 7. Devices page UI/actions

- Added an `Output Devices` preference summary block to the Devices page.
- Added per-device badges for `Primary` and `Fallback`.
- Added device action menus with:
  - `Set as Primary output`
  - `Set as Fallback output`
  - `Clear Primary output`
  - `Clear Fallback output`
- Added right-click support that opens the same action menu for eligible output rows.
- Restricted preference actions to active, non-Audapp physical output devices.

## 8. Resolver priority changes

- Added a preference-aware resolver path with this priority:
  1. saved primary output
  2. saved fallback output
  3. previous restore target
  4. current physical Windows default
  5. first active non-Audapp render output
- Added tests proving:
  - primary beats fallback
  - fallback is used when primary is missing
  - Audapp endpoints are rejected as saved preferences

## 9. Persistence behavior

- Loaded saved output preferences during Tauri setup before `routing_auto_start()`.
- Persisted preference changes to `output-device-preferences.json` under app local data.
- Auto-start now resolves against saved primary/fallback preferences instead of only transient selection state.
- Exposed status messages for:
  - `Primary output not found. Using fallback: <name>.`
  - `Preferred outputs unavailable. Using <name>.`

## 10. Tests/build results

- `cargo check --manifest-path src-tauri\Cargo.toml`: passed
- `cargo test --manifest-path src-tauri\Cargo.toml --lib`: passed (`106` tests)
- `node --test src/lib/*.test.ts`: passed (`76` tests)
- `npm run build`: passed

## 11. Manual smoke status

- `npm run tauri dev` was launched as a smoke-support step but timed out before interactive confirmation.
- Manual checklist remains pending user confirmation:
  1. single visible EQ editor
  2. channel selector present
  3. output gain range `-24..+24 dB`
  4. softer preset dropdown visual
  5. Browser EQ independent from Music
  6. selected channel only is edited
  7. Devices page can set Primary output
  8. Devices page can set Fallback output
  9. preferences persist after restart
  10. startup chooses Primary output
  11. fallback is used when Primary is unavailable
  12. Audapp endpoints cannot be selected as physical output preferences
  13. no driver install/remove commands were run

## 12. Files changed

- `src/components/eq/equalizer-view.tsx`
- `src/components/devices/devices-view.tsx`
- `src/components/engine/dsp-controls.tsx`
- `src/lib/equalizer-view-model.ts`
- `src/lib/equalizer-view-model.test.ts`
- `src/lib/output-device-preferences.ts`
- `src/lib/output-device-preferences.test.ts`
- `src/lib/use-output-device-preferences.ts`
- `src/types/routing.ts`
- `src-tauri/src/audio_bridge/endpoints.rs`
- `src-tauri/src/audio_bridge/mod.rs`
- `src-tauri/src/audio_engine/dsp/gain.rs`
- `src-tauri/src/audio_engine/dsp/persistence.rs`
- `src-tauri/src/audio_policy/manager.rs`
- `src-tauri/src/audio_policy/mod.rs`
- `src-tauri/src/audio_policy/preferences.rs`
- `src-tauri/src/audio_policy/types.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/routing_commands.rs`

## 13. Known limitations

- Manual routing smoke is still user-pending because `tauri dev` was not interactively confirmed in this session.
- The right-click preference menu opens the same row action menu used by the three-dot button; it does not position at the raw pointer location.
- Existing unrelated Rust warnings remain in the project and were not part of this task.

## 14. Next step recommendation

- Do one interactive `npm run tauri dev` validation focused on restart persistence and unavailable-primary fallback behavior, then decide whether to keep the advanced master protection controls on the Equalizer page or move them into a developer-only surface.
