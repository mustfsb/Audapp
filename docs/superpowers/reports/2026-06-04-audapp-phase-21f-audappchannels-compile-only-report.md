# Audapp — Phase 21F AudappChannels Separate-Root Compile-Only Report

**Date:** 2026-06-05
**Branch:** codex/phase-21b-multi-endpoint-compile-only
**Worktree:** C:\Users\musta\Audapp-21B
**Mode:** Build mode — compile-only driver scaffold (NO install / load / devgen / pnputil / bcdedit)

**Companion plan/spec:** `docs/superpowers/specs/2026-06-04-audapp-phase-21e-separate-root-devnodes-architecture-plan.md`

---

## 1. Preflight Health (read-only, before changes)

| Device | InstanceId | Status | Problem | INF / Service |
|---|---|---|---|---|
| Audapp Input (live) | `ROOT\DEVGEN\AUDAPP12G0001` | OK / running | 0 | oem19.inf / AudioCodec |
| AudioMulti (21C/D) | `ROOT\DEVGEN\AUDAPPMULTI21C0001` | OK | CM_PROB_NONE | oem20→oem21.inf / AudioMulti |

Both healthy before work began. Neither was mutated in this phase.

---

## 2. Scaffold Path

New isolated scaffold: `driver/scaffold/audapp-channels/` (derived by copying
`driver/scaffold/audapp-multi/` on-disk, then retargeting). `audapp-input/` and
`audapp-multi/` were left untouched.

---

## 3. Package Identity

| Item | Value |
|---|---|
| Package / product | AudappChannels |
| INF | `AudioChannels.inf` |
| Catalog | `AudappChannels.cat` |
| Service | `AudappChannels` |
| Binary | `AudappChannels.sys` |
| Provider | Audapp |
| Class | MEDIA `{4d36e96c-e325-11ce-bfc1-08002be10318}` |
| Target | `NTamd64.10.0...19041` |
| ACX | 1.0 only (`ACX_VERSION_MAJOR=1; ACX_VERSION_MINOR=0`) |

No `ROOT\AudappInput`, `Audapp Input`, `ROOT\AudappMulti`, `Audapp Multi`, or
`Audapp Voice` appears in any INF directive.

---

## 4. INF / HWID Design

One INF, four `[Manufacturer]` model entries → four hardware IDs, four distinct
DeviceDescs, one shared service/binary, **render-only**:

| Hardware ID | Install section | DeviceDesc (endpoint name) | HW-key `AudappChannel` | Render reference string |
|---|---|---|---|---|
| `ROOT\AudappGeneral` | `Audapp_General` | `Audapp General` | `general` | `SpeakerGeneral` |
| `ROOT\AudappMusic` | `Audapp_Music` | `Audapp Music` | `music` | `SpeakerMusic` |
| `ROOT\AudappGame` | `Audapp_Game` | `Audapp Game` | `game` | `SpeakerGame` |
| `ROOT\AudappBrowser` | `Audapp_Browser` | `Audapp Browser` | `browser` | `SpeakerBrowser` |

Each model section shares `Audio_Device.NT.Copy` (AudappChannels.sys),
`Audio_Service_Inst` (AddService=AudappChannels), and `Audio_wdfsect`, but has
its own `.NT.HW` AddReg (`HKR,,AudappChannel,,"<channel>"`) and `.NT.Interfaces`
registering exactly one render interface (KSCATEGORY_AUDIO/RENDER/REALTIME). No
capture/microphone interface anywhere.

---

## 5. Channel-Selection Implementation (Microsoft-derived source, on-disk only)

In `Codec_EvtBusDeviceAdd` (`Device.cpp`), per devnode:

1. `WdfDeviceOpenRegistryKey(device, PLUGPLAY_REGKEY_DEVICE, KEY_READ, …)` opens
   the device hardware key written by the matched model's `.NT.HW` AddReg.
2. `WdfRegistryQueryString` reads `AudappChannel` (`general|music|game|browser`);
   `Codec_ReadChannelSelector` maps it to an index in `g_AudappRenderChannels[]`
   via `RtlEqualUnicodeString` against each entry's `InternalId`.
3. `Codec_ValidateHardwareId` cross-checks: `WdfDeviceAllocAndQueryProperty(…,
   DevicePropertyHardwareID, …)` is walked as REG_MULTI_SZ and one entry must equal
   the channel's expected `HardwareId` (e.g. `ROOT\AudappGeneral`). A genuine
   mismatch fails `EvtDeviceAdd`; if the property is unreadable, the authoritative
   HW-key selector is trusted.
4. `CodecR_AddStaticRenderSingle` (new helper in `RenderCircuit.cpp`) allocates the
   shared `RENDER_DEVICE_CONTEXT` once and calls `CodecR_CreateRenderCircuit` for
   the single selected channel into `devCtx->Render[0]`. **No multi-render loop.**
5. On a missing/unmatched selector, `EvtDeviceAdd` fails with a clear trace
   (`STATUS_DEVICE_CONFIGURATION_ERROR`) rather than guessing.

`PrepareHardware` already attaches only non-null render circuits and guards the
null capture; `ReleaseHardware` was updated to guard the (now null) capture
removal.

---

## 6. Capture Removal / Render-Only Confirmation

- `Codec_EvtBusDeviceAdd` no longer calls `CodecC_AddStaticCapture`; it traces
  "capture disabled (render-only)" and leaves `devCtx->Capture` null.
- `AudioChannels.inf` registers no `KSCATEGORY_CAPTURE`/Microphone interface.
- Directive-level scan of the staged INF: `KSCATEGORY_CAPTURE` absent,
  `Microphone` absent.

---

## 7. Build / Stage Result

`build-channels.ps1` (VS18 / WDK 10.0.28000.0, `SignMode=Off DriverPackage=False
SupportsPackaging=false`):

```
Oluşturma başarılı oldu.   (Build succeeded)
    0 Uyarı   (0 Warnings)
    0 Hata    (0 Errors)
AudioCodec.vcxproj -> …\project\upstream-audiocodec\x64\Debug\AudappChannels.sys
ApiValidator: Driver is 'Windows Driver'.
```

`Generate-Catalog-channels.ps1` (Inf2Cat, OsTarget `10_VB_X64`):

```
Signability test complete.  Errors: None   Warnings: None
Catalog: …\package\Debug\x64\AudappChannels.cat
```

**0 errors, 0 warnings** at compile, link, ApiValidator, and Inf2Cat.

---

## 8. Identity Guard / INF Validation Results

- **InfVerif** (`Tools\10.0.28000.0\x64\infverif.exe /v /w`): `INF is VALID`, exit 0.
- Staged-INF directive scan (comments stripped):
  - Required present: all four `ROOT\Audapp*` HWIDs, all four `Audapp <Channel>`
    DeviceDescs, `AddService=AudappChannels`, `CatalogFile=AudappChannels.cat`,
    `AudappChannels.sys`, `AudappChannel` HW value — **all PRESENT**.
  - Forbidden in directives: `ROOT\AudappInput`, `Audapp Input`, `ROOT\AudappMulti`,
    `Audapp Multi`, `Audapp Voice`, `KSCATEGORY_CAPTURE`, `Microphone`, `AudioMulti`
    — **all ABSENT** (the only matches were in the INF's descriptive comment header).
- Build/catalog/sign scripts each contain directive-level identity guards that
  abort on any forbidden-identity reference.

---

## 9. Staged Artifacts

`driver/scaffold/audapp-channels/package/Debug/x64/`:

| File | Size (bytes) |
|---|---|
| `AudappChannels.sys` | 73,216 |
| `AudioChannels.inf` | 9,058 |
| `AudappChannels.cat` | 1,380 |
| `package-manifest.txt` | 714 |

(The `package/` directory is gitignored and not committed.)

---

## 10. Commands Run

```powershell
# Preflight (read-only)
git branch --show-current; git status --short; git log --oneline -5
devcon status "@ROOT\DEVGEN\AUDAPP12G0001"
Get-PnpDeviceProperty -InstanceId 'ROOT\DEVGEN\AUDAPP12G0001' -KeyName DEVPKEY_Device_ProblemCode,DEVPKEY_Device_DriverInfPath
Get-PnpDevice | ? { $_.InstanceId -like '*AUDAPPMULTI21C0001*' }

# Scaffold + build (compile-only)
robocopy audapp-multi audapp-channels /E /XD <intermediates>
.\build-channels.ps1 -Configuration Debug -Platform x64
.\Generate-Catalog-channels.ps1 -Configuration Debug -Platform x64
infverif.exe /v /w package\Debug\x64\AudioChannels.inf

# Identity + post-build health (read-only)
<directive-level INF token scan>
devcon status "@ROOT\DEVGEN\AUDAPP12G0001"
Get-PnpDeviceProperty -InstanceId 'ROOT\DEVGEN\AUDAPP12G0001' -KeyName ...
```

---

## 11. No Install / devgen / pnputil / bcdedit — Explicit Confirmation

No `pnputil`, `devgen`, `devcon install`, `bcdedit`, driver load/install/remove,
or driver-store mutation was run. The only `devcon` use was read-only `status`.
The driver store was not touched. No test-signing was enabled.

---

## 12. Live Audapp Input After-Check (read-only)

| Property | Value |
|---|---|
| Status | OK / running |
| ProblemCode | 0 |
| DriverInfPath | oem19.inf |

AudioMulti experiment after-check: `Audapp Multi` Status OK, CM_PROB_NONE, service
AudioMulti — untouched.

---

## 13. Recommendation for Phase 21G

**Proceed to Phase 21G (separate-root VM install / endpoint-visibility test).**
On a fresh VM snapshot reverted to a clean baseline (AudioMulti experiment removed):
sign `AudappChannels.cat` + `.sys`; `pnputil /add-driver AudioChannels.inf`; create
four devnodes (`devgen … /hardwareid "ROOT\Audapp<Ch>"`) and `/install` each; then
verify each devnode is `CM_PROB_NONE` (no Code 37) and that `mmsys.cpl` + IMMDevice
show four distinct, **persistent** names (`Hoparlör (Audapp General/Music/Game/
Browser)`) across disable/enable + reboot, with WASAPI probes passing and Audapp
Input re-verified at ProblemCode 0.
