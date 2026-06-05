# Audapp — Phase 21D AudioMulti Endpoint Naming Fix Report

**Date:** 2026-06-05  
**Branch:** codex/phase-21b-multi-endpoint-compile-only  
**Worktree:** C:\Users\musta\Audapp-21B  
**Mode:** VM-only driver naming-fix mode (Administrator session)

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

## 3. Source Changes

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
| AddInterface comment | `; Render endpoint: Audapp Voice` | `; Render endpoint: Audapp Browser` |
| AddInterface lines (3) | `%KSNAME_SpeakerVoice%` | `%KSNAME_SpeakerBrowser%` |
| Strings: KSNAME | `KSNAME_SpeakerVoice="SpeakerVoice"` | `KSNAME_SpeakerBrowser="SpeakerBrowser"` |
| Strings: szPname | `Audio_Device.SpeakerVoice.szPname="Audapp Voice"` | `Audio_Device.SpeakerBrowser.szPname="Audapp Browser"` |
| DriverVer | 2.0.0.0 | 2.1.0.0 |

No overlap with oem19.inf / ROOT\AudappInput / Audapp Input.

### 3c. `Common/Private.h`

- Added `PCWSTR FriendlyName;` field to `CODEC_PIN_CONTEXT` (stores per-circuit name on bridge pin)
- Added `EVT_ACX_PIN_RETRIEVE_NAME CodecR_EvtBridgePinRetrieveName;` declaration in Codec Render section
- Updated `CodecR_CreateRenderCircuit` prototype to add `_In_opt_ PCWSTR FriendlyName` parameter

### 3d. `Common/RenderCircuit.cpp`

- Added `CodecR_EvtBridgePinRetrieveName` callback: reads `pinCtx->FriendlyName` and returns it via `RtlUnicodeStringPrintf`
- Bridge pin creation: registers `EvtAcxPinRetrieveName` callback when `FriendlyName != nullptr`, stores `FriendlyName` in pin context
- `CodecR_CreateRenderCircuit` signature: added `_In_opt_ PCWSTR FriendlyName` parameter
- `CodecR_AddStaticRender` (legacy): passes `nullptr` for FriendlyName
- `CodecR_AddStaticRenderMulti` (multi-endpoint): passes `Channels[i].FriendlyName`

---

## 4. Build / Sign / Update

| Step | Result |
|---|---|
| `invoke-msbuild-multi.cmd` (Device.cpp, Driver.cpp) | Success, 0 errors, 0 warnings |
| Staged SYS + stamped INF to `package/Debug/x64/` | OK |
| `Generate-Catalog-multi.ps1` (Inf2Cat, OsTarget=10_VB_X64) | Success, no errors |
| `Sign-Catalog-multi.ps1 -SignSys` | AudioMulti.cat + AudioMulti.sys signed, CN=Audapp VM Test Code Signing |
| `pnputil /add-driver AudioMulti.inf /install` | Published: **oem21.inf**, installed on ROOT\DEVGEN\AUDAPPMULTI21C0001 |

---

## 5. Code 37 / Driver Health

| Property | Value |
|---|---|
| Status | OK |
| Problem | CM_PROB_NONE |
| ConfigManagerErrorCode | CM_PROB_NONE |
| Driver | oem21.inf / AudioMulti |

**No Code 37. PASS.**

---

## 6. Naming Investigation Results

### Why "Hoparlör (Audapp Multi)" persisted in Phase 21C

Phase 21C found the endpoints were circuit-distinct (speakergeneral/music/voice/game) but all displayed "Hoparlör (Audapp Multi)". This was traced to the ACX 1.0 AudioEndpointBuilder (AEB) on Win10 behavior:

- The AEB builds the SWD endpoint FriendlyName as `{LocalizedFormFactor} ({ParentDeviceName})`
- FormFactor = "Hoparlör" (localized "Speaker") from `KSNODETYPE_SPEAKER` bridge pin category
- ParentDeviceName = "Audapp Multi" (from INF DeviceDesc for ROOT\DEVGEN\AUDAPPMULTI21C0001)
- All 4 circuits share the same parent device → all get "Audapp Multi"

### What DOES work

- Per-circuit KS interface sub-keys ARE created by the ACX runtime (`#SpeakerGeneral`, `#SpeakerMusic`, `#SpeakerGame`, `#SpeakerBrowser`)
- INF AddReg `HKR,,FriendlyName` values ARE written to these sub-keys:
  - `#SpeakerGeneral\Device Parameters\FriendlyName` = "Audapp General" ✓
  - `#SpeakerMusic\Device Parameters\FriendlyName` = "Audapp Music" ✓
  - `#SpeakerGame\Device Parameters\FriendlyName` = "Audapp Game" ✓
  - `#SpeakerBrowser\Device Parameters\FriendlyName` = "Audapp Browser" ✓
- `EVT_ACX_PIN_RETRIEVE_NAME` callback on the render bridge pin IS called by the ACX stack for KSPROPERTY_PIN_NAME queries

### What DOESN'T work (ACX 1.0 Win10 limitation)

- The AEB does NOT read per-circuit KS interface `FriendlyName` for the SWD endpoint name
- The AEB does NOT use `EVT_ACX_PIN_RETRIEVE_NAME` output for the SWD endpoint FriendlyName
- The SWD endpoint FriendlyName is derived from the parent device name alone
- Direct writes to `HKLM\SYSTEM\CurrentControlSet\Enum\SWD\MMDEVAPI\{endpoint}\FriendlyName` succeed but are overwritten by AEB on device re-enumeration
- The MMDevice property store (`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\{}\Properties`) has ACL-protected entries; `{b3f8fa53...},6` cannot be updated even as Administrator

---

## 7. Windows Endpoint Names

### Current state (session-persistent via SWD registry write)

| Circuit | SWD FriendlyName (Windows Sound Settings) |
|---|---|
| speakergeneral | **Audapp General** |
| speakermusic | **Audapp Music** |
| speakergame | **Audapp Game** |
| speakerbrowser | **Audapp Browser** |
| capture | Mikrofon (Audapp Multi) |
| Audapp Input render | Hoparlör (Audapp Input) |
| Audapp Input capture | Mikrofon (Audapp Input) |

The per-circuit SWD FriendlyNames are set correctly in the current session. However, they reset to "Hoparlör (Audapp Multi)" if the device is disabled/re-enabled or after a system restart + re-enumeration, because the AEB rewrites them from the parent device name.

### WASAPI probe display

The WASAPI `IMMDevice` property store shows "Hoparlör (Audapp Multi)" for all AudioMulti render circuits (the MMDevice Properties store is ACL-protected). This is a cosmetic gap in the probe output only — WASAPI functionality is unaffected.

---

## 8. WASAPI Probe

```
Endpoints probed:  9
Activated OK:      8/9
Initialized OK:    8/9
Started OK:        8/9
Stopped OK:        8/9
All WASAPI steps passed: NO (1 stale Phase 21C residue)
```

The 1 failure: `{32a5c561}` = old `speakervoice` endpoint from Phase 21C (State: not_present, AUDCLNT_E_DEVICE_INVALIDATED). This is expected — Phase 21D replaced it with `speakerbrowser`. The stale MMDevice entry persists until the device is fully re-enumerated or the registry is cleaned.

**All 4 active AudioMulti circuits: Activate OK, GetMixFormat OK (44100Hz 2ch), Initialize OK, Start OK, Stop OK.**

---

## 9. Live Audapp Input After-Check

| Property | Value |
|---|---|
| Status | OK |
| ProblemCode | 0 |
| Service | AudioCodec |
| DriverInfPath | oem19.inf |
| devcon status | Driver is running |

**PASS** — Audapp Input unchanged.

---

## 10. Files Changed

| File | Change |
|---|---|
| `shared/Channels.h` | Voice→Browser, new GUID {D278182B-...} |
| `project/upstream-audiocodec/AudioMulti.inf` | SpeakerVoice→SpeakerBrowser throughout, DriverVer 2.1.0.0 |
| `Common/Private.h` | Added `FriendlyName` to `CODEC_PIN_CONTEXT`, added callback declaration, updated prototype |
| `Common/RenderCircuit.cpp` | Added `CodecR_EvtBridgePinRetrieveName`, wired to bridge pin, threaded FriendlyName through call chain |

---

## 11. Summary and Recommendation

### What was completed

- ✓ Voice→Browser rename in source, INF, channel table, GUIDs
- ✓ Driver rebuilt (AudioMulti.sys), signed, published as oem21.inf
- ✓ No Code 37; device Status OK
- ✓ `EVT_ACX_PIN_RETRIEVE_NAME` infrastructure added (correct DDI, hooks in place)
- ✓ Per-circuit KS interface FriendlyNames correctly written by INF
- ✓ WASAPI: 4 active circuits fully functional
- ✓ Windows Sound Settings: "Audapp General/Music/Game/Browser" visible (session-persistent)
- ✓ Audapp Input untouched

### Phase 21E design item: persistent naming

The per-circuit endpoint naming does not survive device re-enumeration under ACX 1.0 on Win10. The AEB writes "Hoparlör (Audapp Multi)" on every re-enable from the parent device name. To make this persistent without relying on a post-install registry patch, Phase 21E should investigate:

1. **Separate devnodes per circuit**: 4 separate `ROOT\AudappMulti_*` devices, each with distinct INF DeviceDesc ("Audapp General" etc.). This would give each endpoint its own device-level FriendlyName that the AEB would use.
2. **ACX composite template pattern**: Investigate whether `ACXCOMPOSITETEMPLATE` (used in the CODECMC sample) provides per-circuit container control on Win10.
3. **AcxCircuitInitAssignAcxRequestPreprocessCallback**: Handle the device-level KSPROPERTY that AEB reads for container naming.
4. **Post-install naming service**: A lightweight service or driver co-installer that sets the SWD FriendlyNames after device enumeration.

### Recommendation

**Proceed to Phase 21E** with Option 1 (separate devnodes) as the most straightforward approach for Win10 ACX 1.0. The current Phase 21D state is:
- Code correct and committed (Voice→Browser rename complete)
- WASAPI functional for all 4 circuits
- Naming visible in Sound Settings for current session
- Persistent naming is the only remaining open item

---

## 12. Rollback

Primary: **revert to VM snapshot "before 21d naming fix"**.

Manual fallback for AudioMulti only (if snapshot unavailable):
```powershell
pnputil /delete-driver oem21.inf /uninstall /force
pnputil /delete-driver oem20.inf /uninstall /force
```
Never against oem19.inf.
