# Audapp — Phase 21J: Productization + Routing UX/State Fix Report

Date: 2026-06-05
Branch: `main` (no commits made)
Scope: App-side only (Rust/Tauri read paths + React UI). No driver install/remove/rebuild.

## Summary

Phase 21J moves Audapp away from a developer testbench toward a product UI built
on the four AudappChannels outputs (General / Music / Game / Browser). The work
was app-side only: no `pnputil`/`devgen`/`devcon`, no `.inf` changes, no driver
state mutation, no commits.

Preflight confirmed the four AudappChannels devnodes are healthy
(`Service AudappChannels`, `CM_PROB_NONE`) and the branch was `main`.

## 1. Runtime / routing behavior changes

- The backend already targets **Audapp General** as the Windows default render
  endpoint during active routing and stores/restores the previous *physical*
  default (`src-tauri/src/audio_policy/manager.rs`). This was verified, not
  rewritten — the COM `SetDefaultEndpoint` path was left untouched. Rust unit
  tests confirm it:
  - `routing_enable_targets_audapp_general_as_default_endpoint`
  - `routing_enable_never_restores_to_audapp_when_default_missing_from_snapshot`
  - `routing_enable_uses_selected_physical_output_as_restore_target_when_default_is_audapp`
- A new productized **Audio Routing** page surfaces routing state in plain
  language: Active/Stopped, the physical Output device, the Windows default
  (flagged unless it is Audapp General), and per-channel availability.

## 2. Audapp Input primary-flow removal / de-emphasis

- The internal routing model only ever exposes `general/music/game/browser`
  (`internal-channels.ts`, `audapp-endpoints.ts`). Added regression tests:
  - `Audapp General is the default / fallback routing channel`
  - `Audapp Input is never mapped as a primary routing endpoint`
- **Devices** page now labels the Audapp Input endpoint as a filled **Legacy**
  badge (and the old multi endpoint as **Legacy (stale)**), instead of a primary
  "Audapp Input" badge. Audapp Input is never selected as a routing channel or a
  physical render target. The driver/`oem19.inf` was not removed.

## 3. Session deduplication fix

- New layer `src/lib/app-session-group.ts` folds raw Windows audio sessions into
  one user-facing app per stable identity, by descending priority:
  AppUserModelId → packageFamilyName → packageFullName → normalized exe path →
  normalized exe name → PID → session id.
- Browsers normalize to product names (msedge→Microsoft Edge, chrome→Google
  Chrome, firefox/brave/opera/vivaldi). Multiple Edge sessions (even with the
  same PID) collapse into one **Microsoft Edge** card with an "N sessions" badge.
- Mute/volume aggregate across all controllable underlying sessions; a group is
  shown muted only when every controllable session is muted.
- Applied to both **Apps** and **Mixer** (per-channel app lists).
- Tests: `app-session-group.test.ts` (9 cases).

## 4. Optimistic assignment fix

- Root cause found: `selectAssignmentForSession` used a strict `score > best`
  comparison, so when a stale assignment for the same app already existed with a
  slightly different match tuple (different tab title / audio PID), a freshly
  applied optimistic override was appended but the **older** assignment still
  won — matching the reported "doesn't update until Reset/refresh".
- Fix (`channel-assignment-match.ts`):
  - Recency tie-break: equal match strength → latest `updatedAt` wins.
  - New `dropAssignmentsForSession` removes any assignment matching the app
    before writing the optimistic override, so the new choice is the only match.
- `use-channel-assignments.ts` now drops stale same-app assignments, then writes
  the optimistic override (still rolls back + refreshes on persistence failure).
- Resolution priority is unchanged: manual → rule → smart default → fallback.
- Tests: `a newer optimistic override wins over a stale same-app assignment`,
  `dropAssignmentsForSession removes every assignment matching the app`, plus the
  existing manual-override / reset-manual cases.

## 5. Requested vs actual endpoint UI

- New pure helper `summarizeRoutingMatch` (`session-routing-honesty.ts`) compares
  the requested Audapp channel to the actual Windows endpoint and returns a
  filled status + honest guidance:
  - same channel → **Routed to …** (green), no action.
  - different Audapp endpoint → **Manual move needed** (amber) + "Set this app's
    output … in Windows Volume Mixer".
  - non-Audapp output → **Not on Audapp** (blue, info).
  - unknown → neutral, no guidance.
- Never claims an automatic per-app endpoint move happened. Used in Apps and
  Mixer. Tests: 4 cases in `session-routing-honesty.test.ts`.

## 6. UI productization & simplification

- **Navigation**: split into Product (Dashboard, Mixer, Apps, Devices, Audio
  Routing, Equalizer, Noise, Profiles, Settings) and Developer (Engine Lab,
  Routing Lab, Bridge Lab). Developer items are hidden unless **Developer mode**
  is enabled in Settings → Advanced (persisted to localStorage; default off).
  Turning it off while on a dev page falls back to Settings. A "Developer"
  divider/label separates the groups in the sidebar.
- **Audio Routing** is the new product-language routing page (replaces sending
  users into Bridge Lab); the labs keep their detailed counters for developers.
- **Badges**: added filled semantic variants (`success`, `warning`, `info`, and
  a now-filled `destructive`) and a `statusBadgeVariant()` mapping (ok→success,
  warning→warning, error→destructive, legacy/neutral→secondary, info→info). No
  primary status uses transparent outline-only badges anymore. Tests in
  `badge-variant.test.ts`.
- **Density**: Apps shows one card per app with fewer nested borders; route
  intent is kept but de-emphasized below the channel control; long technical
  paragraphs were trimmed to short copy; advanced channel rules stay collapsed.
- **Surfaces**: card radius `rounded-xl`→`rounded-2xl`; Select trigger/content
  radius bumped with hover/focus states and a checked-item style.
- **Wording**: "Voice Lab"/"Lab mode" → "Noise Suppression"/"Preview";
  Equalizer footer "Bridge Lab" → "Audio Routing"; "virtual microphone … pending
  future work" softened.

## 7. Tests / build results

- `node --test src/lib/*.test.ts` → **62 pass / 0 fail**.
- `npm run build` (`tsc && vite build`) → **pass** (1926 modules).
- `cargo check --manifest-path src-tauri\Cargo.toml` → **clean** (pre-existing
  warnings only).
- `cargo test --lib` → **91 pass / 0 fail**.

New/updated test files: `app-session-group.test.ts`, `badge-variant.test.ts`,
`channel-assignment-match.test.ts` (+2), `session-routing-honesty.test.ts` (+4),
`audapp-endpoints.test.ts` (+2).

## 8. Manual smoke status

Not run in this session (requires `npm run tauri dev` + user observation). The
manual smoke checklist from the prompt is ready for the user to execute; not
claimed as passed.

## 9. Files changed

App / nav / settings:
- `src/types/audio.ts` (add `audioRouting` SectionId)
- `src/app/App.tsx` (product/developer nav split, developer-mode state, Audio
  Routing wiring, Settings props)
- `src/components/layout/sidebar.tsx` (Audio Routing icon, Developer group divider)
- `src/components/settings/settings-view.tsx` (Developer mode toggle)

Routing / status:
- `src/components/routing/audio-routing-view.tsx` (NEW)
- `src/components/audapp/audapp-channels-status.tsx` (filled badges, header)

Apps / mixer / devices:
- `src/components/apps/apps-view.tsx` (dedup, optimistic, requested/actual, polish)
- `src/components/mixer/mixer-view.tsx` (dedup app cards, requested/actual badge)
- `src/components/devices/devices-view.tsx` (Legacy labeling, filled badges)

Logic + UI primitives:
- `src/lib/app-session-group.ts` (NEW) + `.test.ts` (NEW)
- `src/lib/badge-variant.ts` (NEW) + `.test.ts` (NEW)
- `src/lib/channel-assignment-match.ts` (recency tie-break, dropAssignmentsForSession) + `.test.ts`
- `src/lib/use-channel-assignments.ts` (session-scoped optimistic write)
- `src/lib/session-routing-honesty.ts` (summarizeRoutingMatch) + `.test.ts`
- `src/lib/audapp-endpoints.test.ts` (+ input/general assertions)
- `src/components/ui/badge.tsx` (filled semantic variants)
- `src/components/ui/card.tsx`, `src/components/ui/select.tsx` (radius/polish)

Copy: `src/components/noise/noise-view.tsx`, `src/components/eq/equalizer-view.tsx`.

No Rust source changes were made in Phase 21J (the Phase 21I working-tree edits
remain as they were).

## 10. Known limitations

- Per-app Windows endpoint switching is still **not automatic** — the UI is
  honest about this and points to Windows Volume Mixer. No claim of automatic
  switching was added.
- Route intent for a multi-session app is applied to all sessions but displayed
  from the representative session; differing per-session intents are not shown
  separately (kept simple by design).
- App grouping aggregates mute/volume but not peak/RMS meters (Windows session
  discovery does not expose per-session peak here).
- Manual smoke not executed; needs user verification with live audio.

## 11. Next phase recommendation

- Phase 21K: user verification of the manual smoke checklist with real Edge +
  music playback, then iterate on any visual/contrast nits surfaced in dark mode.
- Investigate real per-app endpoint moves (IAudioPolicyConfig
  `SetPersistedDefaultAudioEndpoint`) so "Manual move needed" can become an
  actual one-click move where the OS allows it.
- Consider a Dashboard refresh aligned with the new product language and the
  Audio Routing summary.
