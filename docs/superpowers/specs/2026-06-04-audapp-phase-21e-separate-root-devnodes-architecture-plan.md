# Audapp — Phase 21E: Separate Root Devnodes Architecture Plan (Spec)

**Date:** 2026-06-05
**Branch:** codex/phase-21b-multi-endpoint-compile-only
**Worktree:** C:\Users\musta\Audapp-21B
**Mode:** PLANNING / DOCUMENTATION ONLY — no source changes, no build, no sign, no install, no `devgen`, no `pnputil`, no `bcdedit`.

**Goal:** Replace the failed single-devnode naming approach with **four separate root devnodes** (Audapp General / Music / Game / Browser), one render endpoint each, so Windows 10 ACX 1.0 derives a distinct, persistent endpoint name from each devnode's own `DeviceDesc`.

---

## 1. Baseline Health (read-only, verified this session)

| Component | InstanceId | Status | Problem | INF / Service |
|---|---|---|---|---|
| Audapp Input (live) | `ROOT\DEVGEN\AUDAPP12G0001` | OK / running | 0 | oem19.inf / AudioCodec |
| AudioMulti (21C/D experiment) | `ROOT\DEVGEN\AUDAPPMULTI21C0001` | OK | CM_PROB_NONE | oem20→oem21.inf / AudioMulti |

Both healthy at the start and end of this phase. No remediation, mutation, or cleanup is performed here.

---

## 2. Phase 21D Failure Summary + Confirmed AEB Root Cause

Phase 21C proved a single devnode (`ROOT\AudappMulti`, oem20.inf, service `AudioMulti`) hosts **4 render circuits + 1 capture** on Win10 ACX 1.0 with no Code 37, all WASAPI-capable. Phase 21D then attempted to give those four render endpoints distinct, user-visible names from *inside* that one devnode. Every technique failed to persist:

| Attempt | Result |
|---|---|
| INF per-interface `FriendlyName` (`HKR,,FriendlyName,...` per `[Audio_Device.I.Speaker*]`) | Written to KS interface key but **not** used by AEB for the SWD endpoint name. |
| `EVT_ACX_PIN_RETRIEVE_NAME` callback on render bridge pins | ACX calls it for `KSPROPERTY_PIN_NAME`, but AEB does **not** use the result to set the SWD endpoint FriendlyName on Win10 ACX 1.0. |
| Direct SWD registry write (`...\Enum\SWD\MMDEVAPI\{ep}\FriendlyName`) | Transient only; **AEB overwrites on every re-enumeration** (disable/enable, reboot, service restart). Rejected. |
| MMDevice property store write (`...\MMDevices\Audio\Render\{}\Properties\{...},6`) | ACL-protected; **blocked even for Administrator**. |

**Confirmed root cause:** the Win10 AudioEndpointBuilder (AEB) derives every render endpoint's SWD `FriendlyName` as:

```
{LocalizedFormFactor} ({ParentDeviceName})
→ "Hoparlör (Audapp Multi)"
```

where `FormFactor` = localized "Speaker" (from the `KSNODETYPE_SPEAKER` bridge pin category) and `ParentDeviceName` = the **single parent devnode's `DeviceDesc`** (`AudioMulti.DeviceDesc = "Audapp Multi"`). All four circuits share one parent devnode (`ROOT\DEVGEN\AUDAPPMULTI21C0001`), so AEB assigns the same name to all four. **There is no supported ACX 1.0 in-device API to override this per-circuit.**

Therefore the only architecture that yields four naturally-distinct, persistent names is **one devnode per endpoint**, each with its own `DeviceDesc`.

---

## 3. Architecture Option Comparison

| Option | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A** | One INF, four hardware IDs, one shared service/binary; one render circuit per devnode. | Single catalog/signing/binary; per-devnode `DeviceDesc` is exactly the AEB name source → four distinct persistent names; minimal new scaffolding; reuses existing channel table. | INF has four model sections to author carefully. | **RECOMMENDED** |
| **B** | Four separate INF files, one shared binary. | Conceptually isolated per channel. | 4× INF + catalog + signing + publish surface; four `oem##.inf` to roll back; no naming benefit over A. | Rejected |
| **C** | Four services + four binaries. | Maximum isolation. | Highest complexity; four drivers to build/sign/load/maintain; no benefit. | Rejected |
| **D** | Keep single `AudioMulti`; map endpoints by KS interface path only. | No driver re-architecture. | **Does not fix user-visible naming** (still `Hoparlör (Audapp Multi)` ×4); product UX requirement unmet. | Fallback-only (if A unexpectedly fails install) |

### Technical confirmation for Option A
- **Can one KMDF/ACX service bind to multiple root-enumerated hardware IDs?** Yes. Multiple `[Manufacturer]` model lines may map distinct hardware IDs to install sections that all reference the same `AddService`. PnP creates a separate FDO/devnode per hardware ID and invokes `EvtDeviceAdd` once per devnode. This is standard Windows driver behavior and requires no special handling.
- **Should each devnode create exactly one render circuit?** Yes — exactly one, selected by the matched channel. This is simpler than the proven 4-circuit 21C build, lowering Code-37 risk.

---

## 4. Recommended Option + Confirmed Decisions

**Recommended: Option A** — one INF, four hardware IDs, one shared service/binary, one render circuit per devnode.

Confirmed with the user:
1. **Package identity:** NEW identity `AudappChannels` (own INF, service, binary, hardware IDs). Fully independent of oem19 (Audapp Input) and oem20/21 (AudioMulti) for zero collision risk and independent rollback.
2. **Capture:** **Render-only** — four devnodes, one render circuit each, zero capture. Only the live Audapp Input keeps a microphone endpoint.
3. **21G baseline:** Take a fresh snapshot, then **revert to a clean snapshot** (removing the AudioMulti single-devnode experiment + the stale `{32a5c561}` voice endpoint) before installing the new package, so the result is unambiguous.

---

## 5. INF / Service / Devnode Design

### Naming / identity table

| Hardware ID | INF install section | `DeviceDesc` (→ endpoint name) | HW-key channel selector |
|---|---|---|---|
| `ROOT\AudappGeneral` | `Audapp_General` | `Audapp General` → `Hoparlör (Audapp General)` | `general` |
| `ROOT\AudappMusic` | `Audapp_Music` | `Audapp Music` → `Hoparlör (Audapp Music)` | `music` |
| `ROOT\AudappGame` | `Audapp_Game` | `Audapp Game` → `Hoparlör (Audapp Game)` | `game` |
| `ROOT\AudappBrowser` | `Audapp_Browser` | `Audapp Browser` → `Hoparlör (Audapp Browser)` | `browser` |

- **INF file:** `AudioChannels.inf` (CatalogFile `AudappChannels.cat`)
- **Service / binary:** `AudappChannels` / `AudappChannels.sys` — single, shared by all four model sections.
- **devgen instance IDs:** `AUDAPPGENERAL0001`, `AUDAPPMUSIC0001`, `AUDAPPGAME0001`, `AUDAPPBROWSER0001`.
- No `ROOT\AudappInput`, no `Audapp Input` DeviceDesc, no `ROOT\AudappMulti`, and no `Audapp Voice` anywhere in the new INF.

### INF skeleton (design reference for 21F — not authored in this phase)

```inf
[Version]
Signature="$WINDOWS NT$"
Class=MEDIA
ClassGuid={4d36e96c-e325-11ce-bfc1-08002be10318}
Provider=%ProviderName%
CatalogFile=AudappChannels.cat
PnpLockDown=1

[Manufacturer]
%StdMfg%=Standard,NT$ARCH$.10.0...19041

[Standard.NT$ARCH$.10.0...19041]
%Audapp.General.DeviceDesc%=Audapp_General, ROOT\AudappGeneral
%Audapp.Music.DeviceDesc%  =Audapp_Music,   ROOT\AudappMusic
%Audapp.Game.DeviceDesc%   =Audapp_Game,    ROOT\AudappGame
%Audapp.Browser.DeviceDesc%=Audapp_Browser, ROOT\AudappBrowser

; Each model section shares CopyFiles(AudappChannels.sys) + AddService(AudappChannels),
; but each has its own:
;   [Audapp_<Ch>.NT.HW]          AddReg -> HKR,,AudappChannel,,"<channel>"
;   [Audapp_<Ch>.NT.Interfaces]  -> ONE render AddInterface (Speaker<Ch>), NO capture
[Audapp_General.NT.HW]
AddReg=Audapp_General.NT.HW.AddReg
[Audapp_General.NT.HW.AddReg]
HKR,,AudappChannel,,"general"
; ...Music / Game / Browser sections identical in shape, each with its own channel string

[Strings]
ProviderName="Audapp"
StdMfg="Audapp"
Audapp.General.DeviceDesc="Audapp General"
Audapp.Music.DeviceDesc="Audapp Music"
Audapp.Game.DeviceDesc="Audapp Game"
Audapp.Browser.DeviceDesc="Audapp Browser"
```

The single `DeviceDesc` token on each model line is the value AEB consumes for the endpoint display name — four lines, four distinct names.

---

## 6. How the Driver Selects General/Music/Game/Browser per Devnode

**Recommended mechanism: HW-key registry channel selector** (read in `Codec_EvtBusDeviceAdd`, the current `EvtDeviceAdd`):

1. After `WdfDeviceCreate`, call `WdfDeviceOpenRegistryKey(device, PLUGPLAY_REGKEY_DEVICE, KEY_READ, ...)` to open the device's **hardware key**, which the matched model's `[Audapp_<Ch>.NT.HW]` AddReg populated during install (before `EvtDeviceAdd` runs).
2. Read the REG_SZ `AudappChannel` (`general | music | game | browser`).
3. Map the string to the matching `g_AudappRenderChannels[]` entry — the existing table in `driver/scaffold/audapp-multi/shared/Channels.h` (already holds General/Music/Browser/Game with fresh GUIDs, ACX circuit names, reference strings, and FriendlyNames).
4. Create **exactly one** render circuit for that entry via the existing single-circuit `CodecR_CreateRenderCircuit(... FriendlyName)` path (added in Phase 21D). Do **not** call `CodecR_AddStaticRenderMulti`; do **not** call `CodecC_AddStaticCapture`.
5. **Cross-check** the read value against `DEVPKEY_Device_HardwareIds` (require the HWID to contain `Audapp<Channel>`); on mismatch or a missing/empty `AudappChannel`, fail `EvtDeviceAdd` with a clear trace rather than guessing — prevents creating a wrong-named endpoint.

**Why this over alternatives:**
- Deterministic and decoupled from brittle HWID string-parsing (HWID is kept only as a validation cross-check).
- Survives re-enumeration (the value lives in the device's persistent hardware key).
- Reuses the existing channel table and single-circuit path verbatim — minimal new code.
- Avoids per-channel compile-time binaries (Option C) entirely.

Alternatives considered and not chosen: pure HWID-string parsing (brittle), distinct device-interface reference strings (does not change the parent `DeviceDesc` that AEB reads), compile-time variants (4 binaries, no benefit).

---

## 7. Capture Endpoint Decision

The `AudappChannels` package is **render-only**:
- No `CodecC_AddStaticCapture` in the per-channel `EvtDeviceAdd` path.
- No `[Audio_Device.I.Microphone]` interface or capture `AddInterface` in `AudioChannels.inf`.

This prevents four duplicate `Audapp ... Microphone` endpoints. Audapp's microphone continues to come solely from the live **Audapp Input** device (oem19), which is untouched.

---

## 8. Coexistence with Audapp Input and Current AudioMulti

- **Disjoint identity:** new INF (`AudioChannels.inf`), new service/binary (`AudappChannels` / `.sys`), new hardware IDs (`ROOT\Audapp{General,Music,Game,Browser}`), new devgen instance IDs. No PnP match overlap with `ROOT\AudappInput` (oem19) or `ROOT\AudappMulti` (oem20/21).
- **Clean baseline (decision #3):** 21G installs on a clean snapshot with the AudioMulti experiment reverted away, so the endpoint list shows only Audapp Input + the four new render endpoints. The package *could* coexist with AudioMulti (identities are disjoint), but a clean baseline makes the test result unambiguous.
- `oem19.inf` and `ROOT\DEVGEN\AUDAPP12G0001` are never referenced or modified in any phase.

---

## 9. Rollback Strategy

- **Primary:** fresh VM snapshot "before 21g" taken by the user; revert to it.
- **Never** delete `oem19.inf`; **never** touch `ROOT\DEVGEN\AUDAPP12G0001`.
- **Manual fallback (only if a snapshot is unavailable), experimental package only:** remove the four experimental devnodes `ROOT\DEVGEN\AUDAPPGENERAL...|AUDAPPMUSIC...|AUDAPPGAME...|AUDAPPBROWSER...`, then `pnputil /delete-driver <new-oem##.inf> /uninstall /force` for the new package only. Never against oem19 (or oem20/21 unless separately intended).
- No cleanup is performed in this plan phase.

---

## 10. Risk Table

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Compile risk | Low | Med | 21F is compile-only; reuse the proven single-circuit `CodecR_CreateRenderCircuit` path; build via `invoke-msbuild-multi.cmd`; require 0 errors / 0 warnings. |
| INF authoring risk (4 model sections) | Med | Med | Mirror the working oem19/oem20 INF patterns; one `DeviceDesc` token per model line; validate with `InfVerif` / `Inf2Cat`; no `Audapp Input` / `ROOT\AudappMulti` / `Audapp Voice` strings. |
| Multi-devnode install risk | Med | Med | One `devgen` per channel; bind each with `pnputil /add-driver ... /install`; `pnputil /scan-devices`; verify each devnode individually. |
| Code 37 | Low | High | Same ACX 1.0 base as 21C (no Code 37); single render circuit is simpler than the 4-circuit build; verify `ConfigManagerErrorCode = CM_PROB_NONE` per devnode. |
| Duplicate endpoints | Low | Med | Render-only (no capture); exactly one render circuit per devnode; clean-snapshot baseline removes the stale `{32a5c561}` voice endpoint. |
| Naming still merged | Low | High | Distinct `DeviceDesc` per devnode is the AEB name source (root cause directly addressed); verify all four names in mmsys.cpl + IMMDevice and across re-enumeration before declaring success. |
| Rollback confusion | Low | Med | New isolated oem## package + four `ROOT\DEVGEN\AUDAPP{GENERAL,MUSIC,GAME,BROWSER}...` instance IDs; primary rollback = snapshot revert. |
| Impact on Audapp Input | Very low | High | No shared identity; oem19 never touched; re-verify ProblemCode 0 after every install step. |
| Impact on current AudioMulti experiment | Low | Low | Reverted away in 21G; if left installed it is disjoint. |

---

## 11. Phase 21F — Separate-Root Compile-Only Plan

- New package `driver/scaffold/audapp-channels/` derived from `audapp-multi/` (reuse `Common/`, `shared/Channels.h`, build/catalog/sign scripts retargeted to `AudappChannels`).
- New `AudioChannels.inf` with four `[Manufacturer]` model sections, render-only, per the §5 skeleton.
- Driver change: in `Codec_EvtBusDeviceAdd`, replace the 4-circuit loop (`CodecR_AddStaticRenderMulti`) and capture creation (`CodecC_AddStaticCapture`) with: open HW key → read `AudappChannel` → cross-check HWID → single `CodecR_CreateRenderCircuit` for the matched channel.
- Retarget service/binary names to `AudappChannels` / `AudappChannels.sys`; fresh component GUIDs already exist per channel in `Channels.h`.
- **Acceptance:** builds with 0 errors / 0 warnings; `InfVerif` clean on `AudioChannels.inf`; catalog generates; **no install, no sign-for-install**.

---

## 12. Phase 21G — Separate-Root VM Install / Endpoint Visibility Test (Outline)

- User takes a fresh snapshot, then reverts to a clean baseline (AudioMulti experiment removed).
- Sign `AudappChannels.cat` + `AudappChannels.sys`; `pnputil /add-driver AudioChannels.inf`.
- Create four devnodes: `devgen /add /bus ROOT /instanceid AUDAPP<CH>0001 /hardwareid "ROOT\Audapp<Ch>"` for each channel.
- Bind each: `pnputil /add-driver AudioChannels.inf /install`; then `pnputil /scan-devices`.
- **Acceptance:**
  - Each devnode `CM_PROB_NONE` (no Code 37).
  - `mmsys.cpl` + IMMDevice enumeration show four **distinct** names: `Hoparlör (Audapp General / Music / Game / Browser)`.
  - Names **persist** across device disable/enable and a reboot (the 21D failure mode).
  - WASAPI probe passes (Activate/Initialize/Start/Stop) on all four render endpoints.
  - Live Audapp Input re-verified: Status OK, ProblemCode 0, oem19.inf.

---

## 13. Phase 21H — Audapp Discovery Mapping Integration (Outline)

- App maps the four physical Windows render endpoints back to internal channels by `PKEY_Device_FriendlyName` — already read at `src-tauri/src/audio/devices.rs:173` — parsing `Audapp <Channel>` → channel id. (With distinct devnode names this works directly; no KS-path parsing required.)
- **Reconcile `voice` → `browser`:** the app's `src/lib/internal-channels.ts` still defines `voice`, but the driver/endpoint set is General/Music/Game/Browser. Rename the `voice` internal channel to `browser` (id, label "Audapp Browser", description), update `InternalChannelId` union, update `src/types/audio.ts` `bucket` values, and any `voice`-keyed references in `src/lib/channel-workflow.ts`, `src/components/mixer/`, and `src/components/devices/`.
- **Acceptance:** each Audapp internal channel resolves to its matching Windows render endpoint by name; mixer/routing target the correct endpoints end-to-end; existing channel-workflow tests updated and green.

---

## 14. Final Recommendation

Adopt **Option A**: a new render-only `AudappChannels` package with one INF, four hardware IDs (`ROOT\Audapp{General,Music,Game,Browser}`), one shared service/binary, and exactly one render circuit per devnode selected via an HW-key `AudappChannel` registry value (HWID cross-checked). Because the Win10 AEB names each render endpoint from its parent devnode's `DeviceDesc`, four separate devnodes produce four naturally-distinct, **persistent** names — directly fixing the 21D failure — and simultaneously fix the app's discovery mapping, which already reads `PKEY_Device_FriendlyName`. Overall risk: **Low–Medium** (highest residual risk is multi-section INF authoring, mitigated by mirroring proven INFs and `InfVerif`). **Proceed to Phase 21F (compile-only)** on a fresh VM snapshot; no build/sign/install/cleanup occurs until then.
