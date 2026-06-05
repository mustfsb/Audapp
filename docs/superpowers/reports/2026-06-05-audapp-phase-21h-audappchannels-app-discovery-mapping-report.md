# Audapp — Phase 21H: AudappChannels App Discovery + Internal Channel Mapping

- **Date:** 2026-06-05
- **Branch:** `phase-21h-audappchannels-mapping` (off `main`, app repo)
- **Mode:** App integration + safe verification (no driver changes)
- **Rollback snapshot:** `after 21g`
- **Result:** ✅ PASS — builds and tests green, four AudappChannels endpoints discovered and mapped, `voice` replaced by `browser` in the output-channel model, driver untouched and healthy.

---

## 1. Preflight driver/device state

App repo on `main` with only untracked docs; driver worktree `Audapp-21B` isolated on `codex/phase-21b-multi-endpoint-compile-only`. Device state matched the expected 21G/21G.1 baseline:

| Check | Result |
| --- | --- |
| Audapp Input (`ROOT\DEVGEN\AUDAPP12G0001`) | "Driver is running", ProblemCode 0, `oem19.inf` |
| AudappChannels devnodes (General/Music/Game/Browser) | 4 × Status OK, Service `AudappChannels`, `CM_PROB_NONE` |
| Active Audapp render endpoints | General, Music, Game, Browser, Input (DeviceState 1) |
| Audapp Multi | Absent in Render **and** Capture, including `not_present` — fully clean |

No `pnputil` / `devgen` / `bcdedit` / install / remove commands were run at any point.

## 2. AudappChannels endpoint discovery result

The discovery path reads `PKEY_Device_FriendlyName`. Ground truth captured via the read-only `audapp_endpoint_probe.exe` (the validated 21G probe):

```
Hoparlör (Audapp General)   [render]   -> general
Hoparlör (Audapp Music)     [render]   -> music
Hoparlör (Audapp Game)      [render]   -> game
Hoparlör (Audapp Browser)   [render]   -> browser
Hoparlör (Audapp Input)     [render]   -> input (legacy bridge)
Mikrofon (Audapp Input)     [capture]  -> input (legacy bridge)
Hoparlör (High Definition Audio Device) [render] -> physical (not Audapp)
```

Classification is a **lowercased substring match** on `audapp general|music|game|browser|input|multi`, so it does **not** depend on the localized `Hoparlör`/`Mikrofon` prefix. The four channel endpoints are distinguished cleanly.

## 3. Internal channel model changes

The output-channel model moved from `general / music / voice / game` to **`general / music / game / browser`**:

- `InternalChannelId` and `AudioChannel.bucket` unions updated; the `voice` definition was replaced by an `Audapp Browser` channel (label "Audapp Browser", browser/web-audio copy, `Globe` icon).
- Rust `KNOWN_CHANNEL_IDS` (mixer settings validation) updated to `["general","music","game","browser"]`; persisted `voice` settings are now ignored on load and `browser` is a valid persisted channel.
- Voice Lab / microphone DSP concepts (`use-voice-lab`, `voice-lab` types, Noise page, "Voice Clarity" EQ preset) were intentionally left untouched — they are mic features, not output channels.

New backend metadata exposed on every discovered device (Rust → frontend, camelCase):

```
isAudappEndpoint : boolean
audappEndpointKind : "input" | "channel_output" | "legacy_multi" | "unknown" | null
audappChannelId : "general" | "music" | "game" | "browser" | null
```

## 4. Smart default / rules changes

`channel-workflow.ts` smart defaults:

- `spotify` → `music` (unchanged).
- Browser processes (`chrome`, `msedge`, `edge`, `firefox`, `brave`, `opera`, `vivaldi`) → `browser`.
- Everything else, **including Discord / Teams / Zoom**, falls through to the `general` fallback (no forced output channel).
- The rules UI channel dropdown is data-driven off the four internal channels, so it no longer offers `voice`. Rules are not seeded with any default `voice` (or other) output rule — the store still starts empty.

## 5. Devices / Mixer / Apps UI changes

- **Devices:** new "AudappChannels" mapping panel (channel → endpoint, Available/Missing); each endpoint row now shows an Audapp badge (`Audapp General/Music/Game/Browser`, `Audapp Input`), and a legacy Audapp Multi endpoint, if it ever reappears, is badged `Legacy (stale)` in amber.
- **Mixer:** channel strips and per-channel session groups are data-driven and now read General/Music/Game/Browser; an "AudappChannels" availability panel was added with a note that per-app routing is not active yet.
- **Apps:** the assignment dropdown and advanced-rule channel dropdown are data-driven and now expose General/Music/Game/Browser with **no Voice** option.
- **Dashboard:** mixer icon map updated (`browser → Globe`); mock session data no longer references `voice`.

## 6. Bridge / Routing behavior

- A read-only "AudappChannels" status panel was added to **Bridge Lab** reporting per-channel endpoint availability.
- No fake per-app routing is shown — copy explicitly states per-channel routing is not wired yet.
- The existing Audapp Input bridge / one-click system routing path is unchanged and remains usable.

## 7. Tests / build results

| Verification | Command | Result |
| --- | --- | --- |
| Rust type/borrow check | `cargo check` | ✅ pass (only pre-existing dead-code warnings) |
| Rust unit tests | `cargo test --lib audio::` | ✅ 25 passed, 0 failed |
| Frontend build | `npm run build` (`tsc && vite build`) | ✅ pass (1920 modules, 11.16s) |
| TS unit tests | `node --test src/lib/*.test.ts` | ✅ 33 passed, 0 failed |

New/updated tests: Rust `audapp_endpoint` classifier (6), `mixer_settings` (voice→browser, 21H ids), `sessions` (constructor); TS `audapp-endpoints.test.ts` (classification + availability + model), `channel-workflow.test.ts` (browser defaults, Discord→general, browser rules), `solo-resolver.test.ts` (model ids).

## 8. Manual smoke status

**Not yet confirmed by the user.** Automated builds/tests pass; manual smoke checklist is in section "Manual smoke checklist" below. Run `npm run tauri dev` and verify the items there.

## 9. Files changed

New (untracked):
- `src-tauri/src/audio/audapp_endpoint.rs` — endpoint classifier + unit tests
- `src/lib/audapp-endpoints.ts` — TS classifier + channel-availability summary
- `src/lib/audapp-endpoints.test.ts` — TS tests
- `src/components/audapp/audapp-channels-status.tsx` — reusable status panel

Modified:
- Rust: `audio/types.rs`, `audio/devices.rs`, `audio/sessions.rs`, `audio/mixer_settings.rs`, `audio/mod.rs`
- TS types: `types/audio.ts`, `types/discovery.ts`
- TS logic: `lib/internal-channels.ts`, `lib/channel-workflow.ts`
- UI: `app/App.tsx`, `components/devices/devices-view.tsx`, `components/mixer/mixer-view.tsx`, `components/bridge/bridge-lab-view.tsx`, `components/dashboard/dashboard-view.tsx`, `data/mock-audio.ts`
- Tests: `lib/channel-workflow.test.ts`, `lib/solo-resolver.test.ts`

## 10. Next phase recommendation

- **21I — manual smoke + reboot persistence:** confirm the smoke checklist in a live `tauri dev` session, then reboot the VM and re-verify the four endpoints persist with stable names and the app still maps them.
- **21J — per-channel routing design:** the endpoints are now discovered and mapped, but audio is not yet routed per channel. Design how the bridge/mixer fans the mixed stream (or per-session loopback) out to the four AudappChannels render endpoints. This is the larger routing effort intentionally deferred in 21H.
- Optional cleanup: a stale `not_present` Audapp Multi registry endpoint is currently absent, but the Devices UI already badges it `Legacy (stale)` if it returns.

---

## Manual smoke checklist (user)

```
Devices page shows Audapp General/Music/Game/Browser (+ Input, + physical) with Audapp badges,
  and the AudappChannels panel shows 4/4 available.
Apps page assignment dropdown has General/Music/Game/Browser, no Voice.
Mixer shows General/Music/Game/Browser strips and groups, plus the AudappChannels panel.
Bridge/Routing still works with Audapp Input; AudappChannels status panel shows 4/4 available.
Windows default render remains the physical output unless routing is explicitly enabled.
No app crash.
```
