# Audapp Phase 19A Recovery Report

## 1. Driver preflight result

- Working directory: `C:\Users\musta\Audapp`
- Branch: `main`
- Driver instance: `ROOT\DEVGEN\AUDAPP12G0001`
- Friendly name: `Audapp Input`
- Status: `OK`
- Class: `MEDIA`
- Service: `AudioCodec`
- `DEVPKEY_Device_ProblemCode`: `0`
- Driver INF: `oem19.inf`
- Result: driver/routing state remained healthy; no driver work was performed in this phase.

## 2. Implementation summary

- Restored Phase 19A assignment resolution order in the frontend: `manual -> rule -> smart_default -> fallback`.
- Added compact persisted channel rules with enable/disable, priority, editable pattern, and delete support.
- Added assignment source visibility in Apps and Mixer views.
- Added reset-manual-assignment flow so sessions can return to rule/smart-default/fallback behavior.
- Moved Channel Rules into a secondary `Advanced channel rules` section collapsed by default at the bottom of the Apps page.

## 3. Persistence model

- Manual session-to-channel assignments continue to use the existing recovered assignment persistence flow already wired through `useChannelAssignments` and Tauri commands.
- Channel mute/volume continue to use the existing recovered mixer channel setting persistence flow already wired through `useMixerChannelSettings` and Tauri commands.
- Channel rules now persist in `localStorage` with:
  - `audapp.channelRules.v1`
  - `audapp.channelRules.seeded.v1`
- The rules store is intentionally initialized empty and marked seeded once so deleted/default rules do not reappear automatically.

## 4. Assignment resolution priority

1. Manual assignment
2. Enabled user rule by priority (lower number wins)
3. Smart default
4. General fallback

## 5. Rules UI behavior

- Rules are rendered in a compact sentence-like row:
  - `When <match type> "<pattern>" -> <channel>`
- Each rule supports:
  - enabled toggle
  - numeric priority
  - inline edit of match type, pattern, and target channel
  - delete
- New rules can be added from the collapsed advanced section.

## 6. Empty rules behavior

- Empty rules list is valid.
- Users can delete every rule.
- Empty state copy explains that manual assignments and smart defaults still work.
- Seed marker prevents automatic reseeding after deletion.

## 7. Apps changes

- Apps page remains focused on active sessions.
- Added manual reset button beside channel selector when a session is manually assigned.
- Added source/reason text for each resolved channel assignment.
- Preserved route intent as a separate control with explicit POC copy.
- Kept advanced rules secondary and collapsed by default.

## 8. Mixer changes

- Mixer continues to apply persisted channel mute/volume through existing channel controls.
- Session lists now show assignment source and matched rule context when applicable.
- Empty channel groups still show a clear empty state.

## 9. Files changed

- `src/app/App.tsx`
- `src/components/apps/apps-view.tsx`
- `src/components/mixer/mixer-view.tsx`
- `src/lib/channel-rules.ts`
- `src/lib/channel-workflow.ts`
- `src/lib/channel-workflow.test.ts`
- `src/lib/use-channel-rules.ts`
- `src/types/session-control.ts`

## 10. Build results

- `node --test .\src\lib\channel-workflow.test.ts` -> passed (`11` tests)
- `npm run build` -> passed
- `cargo check --manifest-path src-tauri\Cargo.toml` -> passed
- `cargo check` emitted pre-existing Rust warnings only; no Phase 19A compile failure.

## 11. Manual smoke test result

- Not performed in this session.
- `npm run tauri dev` was not launched here, so UI/runtime persistence was not manually exercised end-to-end.

## 12. Known limitations

- Manual assignments still use the existing recovered session-match persistence model, so they follow session identity heuristics rather than a guaranteed permanent per-instance Windows binding.
- Rules are internal Audapp grouping only; this phase does not perform real Windows per-app endpoint reassignment.
- Default suggested rules were intentionally not auto-populated because smart defaults already cover common cases and the recovery goal called for a cleaner, less intrusive Apps page.

## 13. Exact next step

- Launch `npm run tauri dev`, then run the Phase 19A manual smoke flow for manual assignment persistence, empty-rules persistence, rule-based auto-assignment, and mixer mute/volume propagation.
