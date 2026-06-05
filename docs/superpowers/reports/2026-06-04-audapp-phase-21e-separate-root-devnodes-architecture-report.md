# Audapp — Phase 21E Separate Root Devnodes Architecture Report

**Date:** 2026-06-05
**Branch:** codex/phase-21b-multi-endpoint-compile-only
**Worktree:** C:\Users\musta\Audapp-21B
**Mode:** PLANNING / DOCUMENTATION ONLY — no source changes, no build, no sign, no install, no `devgen`/`pnputil`/`bcdedit`.

**Companion spec:** `docs/superpowers/specs/2026-06-04-audapp-phase-21e-separate-root-devnodes-architecture-plan.md`

---

## 1. What Was Inspected

- **Phase docs:** 21C VM install-test report, 21D naming-fix report (root-cause section §6). (21A spec / 21B compile report referenced; the 21A spec file is not present in the worktree under the expected path — 21B/21C/21D reports carry the relevant history.)
- **Driver scaffold (`driver/scaffold/audapp-multi/`):**
  - `shared/Channels.h` — the four-channel table `g_AudappRenderChannels[]` (General/Music/Browser/Game) with fresh per-channel GUIDs, ACX circuit names, INF reference strings, and FriendlyNames.
  - `project/upstream-audiocodec/AudioMulti.inf` — single devnode `ROOT\AudappMulti`, service `AudioMulti`, four render interfaces + one capture, DeviceDesc `Audapp Multi`.
  - `project/upstream-audiocodec/Device.cpp` — `Codec_EvtBusDeviceAdd` creating 4 render circuits via `CodecR_AddStaticRenderMulti` + 1 capture via `CodecC_AddStaticCapture`; `EvtDevicePrepareHardware` attaching all circuits.
  - `Apply-PackageIdentity.ps1` — the package-identity rename pattern (precedent for a new disjoint identity).
- **App mapping code:**
  - `src-tauri/src/audio/devices.rs` — endpoint enumeration reads `PKEY_Device_FriendlyName` (line 173).
  - `src/lib/internal-channels.ts` — internal channels currently `general | music | voice | game` (note the `voice` vs target `browser` mismatch).

---

## 2. Health of Audapp Input and AudioMulti (read-only)

Verified before and after authoring; nothing was mutated.

| Component | InstanceId | Status | Problem | INF / Service |
|---|---|---|---|---|
| Audapp Input (live) | `ROOT\DEVGEN\AUDAPP12G0001` | OK / running | 0 | oem19.inf / AudioCodec |
| AudioMulti (21C/D) | `ROOT\DEVGEN\AUDAPPMULTI21C0001` | OK | CM_PROB_NONE | oem20→oem21.inf / AudioMulti |

Both **healthy**. No remediation performed (not in scope for this phase).

---

## 3. Recommended Architecture

**Option A** — one new INF (`AudioChannels.inf`), four hardware IDs (`ROOT\Audapp{General,Music,Game,Browser}`), one shared service/binary (`AudappChannels` / `AudappChannels.sys`), **one render circuit per devnode**, **render-only** (no capture). Each devnode selects its channel by reading an HW-key `AudappChannel` REG_SZ in `Codec_EvtBusDeviceAdd` (cross-checked against `DEVPKEY_Device_HardwareIds`) and creates exactly one circuit via the existing `CodecR_CreateRenderCircuit(... FriendlyName)` path.

Confirmed decisions: new `AudappChannels` identity; render-only; clean-snapshot baseline before the 21G install.

---

## 4. Why This Fixes the User-Visible Naming Problem (and Discovery)

The Win10 ACX 1.0 AudioEndpointBuilder derives each render endpoint's SWD `FriendlyName` as `{LocalizedFormFactor} ({ParentDeviceName})`, where `ParentDeviceName` is the **parent devnode's `DeviceDesc`** (21D §6, confirmed). With one devnode, all four endpoints collapse to `Hoparlör (Audapp Multi)`, and no in-device API persistently overrides this.

Four separate devnodes give four distinct `DeviceDesc` values, so AEB produces four naturally-distinct, **persistent** names (`Hoparlör (Audapp General / Music / Game / Browser)`) with no post-install registry patching — directly defeating the 21D failure mode.

The same change fixes app discovery for free: `devices.rs:173` already reads `PKEY_Device_FriendlyName`, so distinct devnode names flow straight to the app's channel mapping instead of four identical strings.

---

## 5. Risk Rating

**Low–Medium.** Highest residual risk is authoring the four-section INF correctly (mitigated by mirroring the proven oem19/oem20 INFs and running `InfVerif`). Code-37 risk is low — the build is *simpler* than the 21C 4-circuit build (one circuit per devnode), on the same ACX 1.0 base that already passed with no Code 37. Render-only + clean baseline remove duplicate-endpoint risk. Audapp Input is fully isolated (no shared identity; oem19 never touched). Full table in the spec §10.

---

## 6. The `voice` → `browser` App Reconciliation (flagged for 21H)

The driver/endpoint set is General/Music/Game/Browser, but the app's `internal-channels.ts` still defines a `voice` channel. Phase 21H must rename the internal `voice` channel to `browser` (id, label, description), update the `InternalChannelId` union and `src/types/audio.ts` buckets, and fix `voice`-keyed references in `channel-workflow.ts`, `components/mixer/`, and `components/devices/`, plus the related tests. Out of scope for 21E; recorded so it is not lost.

---

## 7. Commands Run (read-only preflight only)

```powershell
git branch --show-current ; git status --short ; git log --oneline -5

$devcon = "C:\Program Files (x86)\Windows Kits\10\Tools\10.0.28000.0\x64\devcon.exe"
& $devcon status "@ROOT\DEVGEN\AUDAPP12G0001"
Get-PnpDevice -InstanceId 'ROOT\DEVGEN\AUDAPP12G0001' | Format-List FriendlyName,Status,Class,InstanceId
Get-PnpDeviceProperty -InstanceId 'ROOT\DEVGEN\AUDAPP12G0001' `
  -KeyName DEVPKEY_Device_ProblemCode,DEVPKEY_Device_DriverInfPath
Get-PnpDevice | Where-Object { $_.InstanceId -like '*AudappMulti*' -or $_.InstanceId -like '*AUDAPPMULTI21C0001*' } |
  Format-List FriendlyName,Status,Class,InstanceId,Service,Problem,ConfigManagerErrorCode
```

No mutating command was run. No build, sign, install, `devgen`, `pnputil`, or `bcdedit`.

---

## 8. Should Phase 21F Proceed?

**Yes.** The architecture is sound, isolated from the live driver, and lower-complexity than the proven 21C build. 21F is compile-only (no install), so it cannot affect the live machine.

---

## 9. Exact Next Step

Begin **Phase 21F — Separate-root compile-only scaffold**: create `driver/scaffold/audapp-channels/`, author `AudioChannels.inf` (four render-only model sections), retarget service/binary to `AudappChannels`, replace the 4-circuit + capture logic in `Codec_EvtBusDeviceAdd` with HW-key channel read + single `CodecR_CreateRenderCircuit`, and build to **0 errors / 0 warnings** with `InfVerif` clean. No install until Phase 21G, which requires a fresh user VM snapshot.
