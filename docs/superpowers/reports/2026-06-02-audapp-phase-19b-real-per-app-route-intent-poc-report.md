# Audapp Phase 19B Real Per-App Route Intent POC Report

## 1. Driver preflight result

- Working directory: `C:\Users\musta\Audapp`
- Branch: `main`
- Driver instance: `ROOT\DEVGEN\AUDAPP12G0001`
- Friendly name: `Audapp Input`
- `devcon status`: `Driver is running.`
- `devcon stack`: class `MEDIA`, controlling service `AudioCodec`
- `Get-PnpDevice`: `Status = OK`, `Class = MEDIA`
- `DEVPKEY_Device_ProblemCode`: `0`
- `DEVPKEY_Device_DriverInfPath`: `oem19.inf`
- Result: driver/routing state remained healthy; no driver/root-device work was performed in this phase.

## 2. Implementation path chosen

- Chosen path: `B`
- Reason: this VM exposes reliable session inspection APIs and the existing global default-endpoint `IPolicyConfig` path, but we did not find a safe public Windows API surface for assigning a specific app/session to a different render endpoint.
- Product behavior now stays honest: route intent remains selectable/persistent, but non-system endpoint intents are reported as `unsupported` instead of pretending to be applied.

## 3. APIs and surfaces investigated

### Public Windows SDK / Core Audio surface

- `audiopolicy.idl` / `audiopolicy.h`
  - `IAudioSessionControl::GetDisplayName`
  - `IAudioSessionControl::GetGroupingParam`
  - `IAudioSessionControl2::GetSessionIdentifier`
  - `IAudioSessionControl2::GetSessionInstanceIdentifier`
  - `IAudioSessionControl2::GetProcessId`
- `appmodel.h`
  - `GetApplicationUserModelId`
  - `GetPackageFullName`
  - `GetPackageFamilyName`

### Existing Audapp routing surface

- `src-tauri/src/audio_policy/default_endpoint.rs`
  - existing undocumented `IPolicyConfig` use is system-wide only (`SetDefaultEndpoint`), not per-app

### Registry / stored state inspection

- Read-only inspection confirmed Windows stores per-app audio preference state under:
  - `HKCU\Software\Microsoft\Internet Explorer\LowRegistry\Audio\PolicyConfig\PropertyStore`
- This phase did not write registry keys.

### Negative finding that drove Path B

- SDK/header searches on this VM did not surface a documented/public `SetPersistedDefaultAudioEndpoint`, `GetPersistedDefaultAudioEndpoint`, or `IAudioPolicyConfigFactory` path that we could treat as a safe supported implementation surface for Audapp.

## 4. Identifiers available per session

Backend session discovery now surfaces:

- process id
- process executable name
- process executable path
- session identifier
- session instance identifier
- grouping parameter GUID
- display name
- current endpoint id (`deviceId`)
- AppUserModelId when available
- package full name when available
- package family name when available

Probe evidence from this VM session:

```text
source=windows-core-audio
state=ready
device_count=4
session_count=1

display_name=System Sounds
device_id={0.0.0.00000000}.{6dee1be1-f344-45e4-aa77-2fb20caac6b9}
session_id={0.0.0.00000000}.{6dee1be1-f344-45e4-aa77-2fb20caac6b9}|#%b{A9EF3FD9-4240-455E-A4D5-F2B3301887B2}
session_instance_id={0.0.0.00000000}.{6dee1be1-f344-45e4-aa77-2fb20caac6b9}|#%b{A9EF3FD9-4240-455E-A4D5-F2B3301887B2}|1%b#
grouping_param=BA4476AE-E578-46CE-948F-47CB6A4797C5
app_user_model_id=
package_full_name=
package_family_name=
```

- Only `System Sounds` was active during the probe run, so no live Edge/Chrome/Spotify app identity sample was captured in this session.

## 5. Behavior implemented

- Added a backend `SessionRouteCapability` contract that currently reports per-app switching as unsupported through the safe API path.
- Added richer session identity capture so future per-app routing work can key on more than process id alone.
- Added a small `audapp_session_probe` binary to print real discovery-session identifiers for investigation/reporting.
- Kept persisted route intents intact.
- Added honest route apply-state derivation:
  - `audapp` -> `unsupported`
  - `bypass` -> `unsupported`
  - `system` -> `ui_only`
  - `monitor_only` -> `ui_only`
- No fake `applied` state is emitted for per-app endpoint reassignment.

## 6. UI changes

- Apps view now shows:
  - route intent
  - apply status
  - applied endpoint (`none` for Path B)
  - last error / unsupported reason
  - manual Windows Volume Mixer fallback guidance
- Mixer view now shows:
  - unsupported experimental-copy header
  - per-session apply status and applied endpoint rows where sessions are present
- Helper copy now explicitly states that internal Audapp channels are separate from Windows endpoint routing.

## 7. Files changed

- `src-tauri/Cargo.toml`
- `src-tauri/src/audio/assignments.rs`
- `src-tauri/src/audio/mod.rs`
- `src-tauri/src/audio/process.rs`
- `src-tauri/src/audio/route_support.rs`
- `src-tauri/src/audio/sessions.rs`
- `src-tauri/src/audio/types.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/bin/audapp_session_probe.rs`
- `src/app/App.tsx`
- `src/components/apps/apps-view.tsx`
- `src/components/mixer/mixer-view.tsx`
- `src/lib/session-route-status.ts`
- `src/lib/session-route-status.test.ts`
- `src/lib/use-session-route-capability.ts`
- `src/lib/use-session-route-intents.ts`
- `src/types/discovery.ts`
- `src/types/session-control.ts`
- `src/types/session-view.ts`

## 8. Build and verification results

- `node --test .\src\lib\channel-workflow.test.ts .\src\lib\session-route-status.test.ts` -> PASS (`15` tests)
- `cargo test phase_19b_capability_is_honestly_unsupported --manifest-path src-tauri\Cargo.toml` -> PASS
- `cargo run --quiet --manifest-path src-tauri\Cargo.toml --bin audapp_session_probe` -> PASS
- `cargo check --manifest-path src-tauri\Cargo.toml` -> PASS
- `npm run build` -> PASS

## 9. Manual smoke test result

- Full Tauri runtime smoke test with active Edge/Chrome/Spotify session reassignment: `NOT RUN`
- Lightweight UI verification was performed against local browser preview:
  - Apps page rendered the new experimental copy and unsupported/manual-fallback message
  - Mixer page rendered the new unsupported helper copy
- This preview verification does not prove Tauri runtime persistence or live Windows-session behavior.

## 10. Limitations

- Real Windows per-app endpoint reassignment is still not implemented.
- No safe supported API was identified for moving a live app/session to Audapp Input or to a physical bypass endpoint.
- Registry state was inspected read-only only; no registry-write implementation was attempted.
- The route apply state is intentionally conservative and honest.
- Live app probe evidence in this session did not include Edge/Chrome/Spotify because those sessions were not active during the probe capture.

## 11. Exact next step

- Launch the Tauri app with a real active browser/media session, capture live session identifiers for `msedge.exe` or `chrome.exe`, and only continue to Path A/C if a verifiable safe COM/API path for per-app endpoint assignment can be demonstrated without registry-key guessing.
