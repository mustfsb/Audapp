# Audapp — Phase 21D AudioMulti Endpoint Naming Fix Report

**Date:** 2026-06-05  
**Branch:** codex/phase-21b-multi-endpoint-compile-only  
**Worktree:** C:\Users\musta\Audapp-21B  
**Mode:** VM-only driver naming-fix mode (Administrator session)

---

## STATUS: INCOMPLETE — Persistent endpoint naming NOT achieved

Phase 21D is **partially complete**. The Voice→Browser source rename is done and the driver is healthy. However, the primary acceptance criterion — user-visible distinct endpoint names in Windows Sound / mmsys.cpl — is **NOT met**. Windows Sound continues to display four endpoints as "Hoparlör (Audapp Multi)". The naming fix failed.

---

## 1. Snapshot Confirmation

VM snapshot **"before 21d naming fix"** confirmed by user before any mutating action.

---

## 2. Baseline (Before Changes)

| Component | State |
|---|---|
| ROOT\DEVGEN\AUDAPPMULTI21C0001 | OK, CM_PROB_NONE, oem20.inf |
| 4x render endpoint SWD names | "Hoparlör (Audapp Multi)" |
| Audapp Input (ROOT\DEVGEN\AUDAPP12G0001) | Running, ProblemCode 0, oem19.inf |

Old endpoint names: all four render endpoints displayed identically as "Hoparlör (Audapp Multi)".

---

## 3. Source Changes (Complete)

### 3a. `shared/Channels.h`

| Change | Old | New |
|---|---|---|
| Component GUID | `AUDAPP_RENDER_VOICE_GUID` (1bf49d44-...) | `AUDAPP_RENDER_BROWSER_GUID` ({D278182B-8DB8-47D2-AE6D-6EF1739172D2}) |
| Unicode circuit name | `audappRenderVoiceName` = `L"SpeakerVoice"` | `audappRenderBrowserName` = `L"SpeakerBrowser"` |
| Channel table row | `{ L"voice", ..., L"SpeakerVoice", L"Audapp Voice" }` | `{ L"browser", ..., L"SpeakerBrowser", L"Audapp Browser" }` |

New GUID generated fresh (not reused from Voice).

### 3b. `project/upstream-audiocodec/AudioMulti.inf`

| Change | Old | New |
|---|---|---|
| Interface section | `[Audio_Device.I.SpeakerVoice]` | `[Audio_Device.I.SpeakerBrowser]` |
| AddReg section | `[Audio_Device.I.SpeakerVoice.AddReg]` | `[Audio_Device.I.SpeakerBrowser.AddReg]` |
| HKR FriendlyName | `%Audio_Device.SpeakerVoice.szPname%` | `%Audio_Device.SpeakerBrowser.szPname%` |
| AddInterface lines (3) | `%KSNAME_SpeakerVoice%` | `%KSNAME_SpeakerBrowser%` |
| Strings: KSNAME | `KSNAME_SpeakerVoice="SpeakerVoice"` | `KSNAME_SpeakerBrowser="SpeakerBrowser"` |
| Strings: szPname | `Audio_Device.SpeakerVoice.szPname="Audapp Voice"` | `Audio_Device.SpeakerBrowser.szPname="Audapp Browser"` |
| DriverVer | 2.0.0.0 | 2.1.0.0 |

No overlap with oem19.inf / ROOT\AudappInput / Audapp Input.

### 3c. `Common/Private.h`

- Added `PCWSTR FriendlyName;` field to `CODEC_PIN_CONTEXT`
- Added `EVT_ACX_PIN_RETRIEVE_NAME CodecR_EvtBridgePinRetrieveName;` declaration
- Updated `CodecR_CreateRenderCircuit` prototype: added `_In_opt_ PCWSTR FriendlyName` parameter

### 3d. `Common/RenderCircuit.cpp`

- Added `CodecR_EvtBridgePinRetrieveName` callback: reads `pinCtx->FriendlyName`, returns via `RtlUnicodeStringPrintf`
- Bridge pin creation: registers `EvtAcxPinRetrieveName` when `FriendlyName != nullptr`; stores `FriendlyName` in pin context
- `CodecR_AddStaticRender` (legacy): passes `nullptr`
- `CodecR_AddStaticRenderMulti`: passes `Channels[i].FriendlyName`

---

## 4. Build / Sign / Update

| Step | Result |
|---|---|
| `invoke-msbuild-multi.cmd` (Device.cpp, Driver.cpp) | Success, 0 errors, 0 warnings |
| Staged SYS + stamped INF to `package/Debug/x64/` | OK |
| `Generate-Catalog-multi.ps1` (Inf2Cat, OsTarget=10_VB_X64) | Success |
| `Sign-Catalog-multi.ps1 -SignSys` | AudioMulti.cat + AudioMulti.sys signed |
| `pnputil /add-driver AudioMulti.inf /install` | Published: **oem21.inf**, installed on ROOT\DEVGEN\AUDAPPMULTI21C0001 |

---

## 5. Driver Health

| Property | Value |
|---|---|
| Status | OK |
| Problem | CM_PROB_NONE |
| Driver | oem21.inf / AudioMulti |

No Code 37. Driver healthy. Audapp Input untouched on oem19.inf.

---

## 6. Endpoint Naming: FAILED

### Acceptance criterion

User-visible distinct endpoint names in Windows Sound (mmsys.cpl) and IMMDevice enumeration:
- Audapp General
- Audapp Music
- Audapp Game
- Audapp Browser

### Actual result

**Windows Sound still shows four endpoints as "Hoparlör (Audapp Multi)".** The acceptance criterion is NOT met.

### What was attempted

1. **INF AddReg FriendlyName**: Per-circuit KS interface sub-keys (`#SpeakerGeneral`, `#SpeakerMusic`, `#SpeakerGame`, `#SpeakerBrowser`) ARE created with correct `FriendlyName` values in `Device Parameters`. These values are present in the registry but are not used by AudioEndpointBuilder for the SWD endpoint display name.

2. **`EVT_ACX_PIN_RETRIEVE_NAME` callback**: Wired to render bridge pins. The ACX stack calls this for `KSPROPERTY_PIN_NAME` queries. However, AudioEndpointBuilder on Win10 ACX 1.0 does NOT use the pin name query result to set the SWD endpoint FriendlyName.

3. **Direct SWD registry write**: Wrote per-circuit names directly to `HKLM:\SYSTEM\CurrentControlSet\Enum\SWD\MMDEVAPI\{ep}\FriendlyName`. This produced transient session-visible names, but **AudioEndpointBuilder overwrites them on every device re-enumeration** (device disable/enable, reboot, service restart) from the parent device name. This is not a real fix and is explicitly rejected as an acceptance criterion.

4. **MMDevice property store write**: `HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\{}\Properties\{b3f8fa53-...},6` has ACL-protected entries. Even Administrator cannot write this path. Blocked.

### Root cause (confirmed)

ACX 1.0 on Win10 19045 — the AudioEndpointBuilder (AEB) derives all render endpoint SWD FriendlyNames from the **parent device name** using the pattern:

```
{LocalizedFormFactor} ({ParentDeviceName})
→ "Hoparlör (Audapp Multi)"
```

Where:
- FormFactor = "Hoparlör" (localized "Speaker") — from `KSNODETYPE_SPEAKER` bridge pin category
- ParentDeviceName = "Audapp Multi" — from INF `AudioMulti.DeviceDesc` for the single ROOT\AudappMulti device

All four circuits share the same parent device (`ROOT\DEVGEN\AUDAPPMULTI21C0001`), so the AEB assigns the same name to all four SWD endpoints. Neither the per-circuit INF `FriendlyName` entries, nor the `EVT_ACX_PIN_RETRIEVE_NAME` DDI output, nor any post-install registry write produces a persistent change to what Windows Sound displays.

---

## 7. WASAPI Probe

Four active AudioMulti circuits are functional (WASAPI Activate/Initialize/Start/Stop pass). WASAPI functionality is not impaired. The naming failure is display-only but is a hard requirement.

One stale endpoint `{32a5c561}` = old `speakervoice` from Phase 21C — `AUDCLNT_E_DEVICE_INVALIDATED`. Expected; needs cleanup in Phase 21E.

---

## 8. Live Audapp Input After-Check

| Property | Value |
|---|---|
| Status | OK |
| ProblemCode | 0 |
| Service | AudioCodec |
| DriverInfPath | oem19.inf |

PASS — Audapp Input unchanged.

---

## 9. Summary

### What was completed

- ✓ Voice→Browser rename in source, INF, channel table, GUIDs (committed, c5fa38e)
- ✓ Driver rebuilt, signed, published as oem21.inf
- ✓ No Code 37; driver Status OK
- ✓ `EVT_ACX_PIN_RETRIEVE_NAME` infrastructure added (correct DDI hook, in place for future use)
- ✓ Per-circuit KS interface FriendlyNames correctly written by INF to registry
- ✓ WASAPI: 4 active circuits fully functional
- ✓ Audapp Input untouched

### What was NOT achieved

- ✗ **Persistent user-visible endpoint naming** — Windows Sound shows "Hoparlör (Audapp Multi)" ×4
- ✗ SWD registry writes are non-persistent (AEB resets on re-enumeration)
- ✗ MMDevice property store write is blocked by ACL
- ✗ INF per-circuit FriendlyName is not read by AEB for SWD endpoint naming

Phase 21D naming objective is **incomplete**.

---

## 10. Phase 21E: Recommended Fix

### Problem

All four circuits share one parent device node (`ROOT\AudappMulti`). The AEB names every endpoint from that one parent. There is no supported ACX 1.0 API to override this per-circuit from within a single device.

### Recommended approach: Separate root devnodes per endpoint

Create four separate device nodes, each with its own DeviceDesc:

| Device ID | INF DeviceDesc | Expected Windows Sound name |
|---|---|---|
| `ROOT\AudappGeneral` | "Audapp General" | "Hoparlör (Audapp General)" |
| `ROOT\AudappMusic` | "Audapp Music" | "Hoparlör (Audapp Music)" |
| `ROOT\AudappGame` | "Audapp Game" | "Hoparlör (Audapp Game)" |
| `ROOT\AudappBrowser` | "Audapp Browser" | "Hoparlör (Audapp Browser)" |

Each devnode gets its own service instance, its own single-circuit INF section. The AEB then derives the SWD endpoint name from each device's own DeviceDesc, giving permanently distinct display names without any post-install registry patching.

This requires:
- Four separate `[Manufacturer]` match entries in INF (or four separate INF files)
- Four separate devgen device nodes
- Four separate ACX circuit registrations (one per driver instance)
- Distinct service names per circuit, or one service handling all four hardware IDs

### Alternative approaches (lower confidence)

- **AcxCompositeTemplate pattern**: Investigate whether the CODECMC composite sample provides per-circuit container identity on Win10. Unknown if this affects AEB naming.
- **Post-install naming service**: A lightweight service writes SWD FriendlyNames after each AEB enumeration event. Fragile; not recommended as primary.

### Do not proceed without

1. A fresh VM snapshot ("before 21e") taken by the user
2. Explicit Phase 21E prompt and scope confirmation

---

## 11. Rollback

Primary: **revert to VM snapshot "before 21d naming fix"**.

Manual fallback for AudioMulti only (if snapshot unavailable):
```powershell
pnputil /delete-driver oem21.inf /uninstall /force
pnputil /delete-driver oem20.inf /uninstall /force
```
Never against oem19.inf.
