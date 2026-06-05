# Audapp — Phase 21B Multi-Endpoint Driver Compile-Only Report

**Date:** 2026-06-05
**Phase:** 21B — Multi-Endpoint Driver Compile-Only Scaffold
**Worktree branch:** `codex/phase-21b-multi-endpoint-compile-only`
**Companion spec:** `docs/superpowers/specs/2026-06-04-audapp-phase-21a-multi-endpoint-driver-architecture-plan.md`

**Result:** ✅ Compile + stage succeeded. `AudioMulti.sys` built (ACX 1.0, 0 warnings / 0 errors with `/WX`), `AudioMulti.inf` stamped & staged. The live `Audapp Input` driver was never touched and remains healthy. **No** install / load / devgen / devcon / pnputil / bcdedit ran.

---

## 1. Driver Preflight — Before and After

Identical, healthy, before and after the build (read-only checks only):

| Check | Before | After |
| --- | --- | --- |
| `devcon status @ROOT\DEVGEN\AUDAPP12G0001` | Driver is running | Driver is running |
| `Get-PnpDevice` Status | OK (Audapp Input, MEDIA) | OK (Audapp Input, MEDIA) |
| `DEVPKEY_Device_ProblemCode` | 0 | 0 |
| `DEVPKEY_Device_DriverInfPath` | oem19.inf | oem19.inf |

The shipping single-endpoint stack was unaffected.

## 2. Isolation / Worktree

- Decision (confirmed with user): **worktree + copy source**, **mirror audapp-input gitignore** (commit only Audapp-owned files), **full compile + stage**.
- Created `git worktree add C:\Users\musta\Audapp-21B -b codex/phase-21b-multi-endpoint-compile-only`.
- The shipping `driver/scaffold/audapp-input/` tree on `main` was **not modified**.
- Experimental code lives under `driver/scaffold/audapp-multi/`, created by copying the on-disk `audapp-input` tree (the upstream ACX source is gitignored and exists on-disk only; there is no local `Windows-driver-samples` checkout to re-`prepare` from, so a fresh worktree alone is not buildable — the copy supplies the source).

### Git tracking policy (per user instruction)

Microsoft-derived ACX sample source is **intentionally not committed** (licensing/provenance), matching the `audapp-input` policy. `audapp-multi/.gitignore` ignores those files; only Audapp-owned files are tracked.

- **Committed (Audapp-owned):** `shared/Channels.h`, `project/upstream-audiocodec/AudioMulti.inf`, `build-multi.ps1`, `.gitignore`, and the scaffold tooling/docs copied from `audapp-input` (`build.ps1`, `prepare.ps1`, `Apply-PackageIdentity.ps1`, `Generate-Catalog.ps1`, `Sign-Catalog.ps1`, `BUILD.md`, `SAFETY.md`, `PROVENANCE.md`, `README.md`).
- **On-disk only (gitignored, Microsoft-derived, modified for Phase 21B):**
  - `project/upstream-audiocodec/Device.cpp` — render create/attach/release loops.
  - `Common/RenderCircuit.cpp` — added `CodecR_AddStaticRenderMulti`.
  - `shared/Public.h` — `CODEC_DEVICE_CONTEXT.Render` → array; `#include "Channels.h"`; new prototype.
  - `project/upstream-audiocodec/AudioCodec.vcxproj` — `TargetName=AudioMulti`, `Inf Include=AudioMulti.inf`.
  - Unmodified MS-derived: `Driver.cpp`, `DriverSettings.h`, `Common/*` (other), `inc/*`, `shared/Trace.h`, `Common/SamplesCommon.vcxproj`, `AudioCodec.sln`.

### Reproduction (since the MS-derived edits are not committed)

1. `robocopy driver\scaffold\audapp-input driver\scaffold\audapp-multi /E /XD x64 build package out` (from the on-disk `audapp-input`).
2. Overlay the committed Audapp-owned files (`Channels.h`, `AudioMulti.inf`, `build-multi.ps1`, `.gitignore`).
3. Re-apply the four documented MS-derived edits above (Device.cpp loops, RenderCircuit.cpp helper, Public.h context+include+prototype, vcxproj TargetName/Inf).
4. `powershell -File build-multi.ps1`.

## 3. Experimental Package Identity

| Property | Value | Distinct from live? |
| --- | --- | --- |
| Hardware ID | `ROOT\AudappMulti` | ✅ (live: `ROOT\AudappInput`) |
| Device description | `Audapp Multi` | ✅ (live: `Audapp Input`) |
| Service | `AudioMulti` | ✅ (live: `AudioCodec`) |
| Driver binary | `AudioMulti.sys` | ✅ (live: `AudioCodec.sys`) |
| INF | `AudioMulti.inf` (→ `AudioMulti.cat`) | ✅ (live: `oem19.inf`) |
| DriverVer | `2.0.0.0` source; stampinf set `06/05/2026,4.11.8.286` | ✅ |

The package cannot match `ROOT\AudappInput` / `Audapp Input` / `oem19.inf`.

## 4. Channel Table (`shared/Channels.h`, Audapp-owned)

Four render endpoints, each with a freshly generated component GUID (none reuse the shipping `CODEC_RENDER_COMPONENT_GUID`):

| Internal id | Circuit name / INF ref string | FriendlyName | Component GUID |
| --- | --- | --- | --- |
| general | `SpeakerGeneral` | Audapp General | `ce9d337e-931c-48b1-8b7c-268a2daccb1f` |
| music | `SpeakerMusic` | Audapp Music | `f35071ca-8683-4aea-936b-10292f37c63c` |
| voice | `SpeakerVoice` | Audapp Voice | `1bf49d44-3ec2-455f-9986-750693004587` |
| game | `SpeakerGame` | Audapp Game | `5702375d-cad1-4ead-98dd-62bcfdd3253c` |

The header keeps type/count/extern always available and emits the GUID/name/table storage exactly once (in `Device.cpp`, via `AUDAPP_CHANNELS_IMPL`), avoiding duplicate-symbol link errors. Table declared/defined with `extern "C"` for consistent linkage.

## 5. Render Circuit Changes (MS-derived, on-disk)

- `CODEC_DEVICE_CONTEXT.Render` is now `ACXCIRCUIT Render[AUDAPP_RENDER_CHANNEL_COUNT]` (4); `Capture` unchanged (single).
- New `CodecR_AddStaticRenderMulti(Device, Channels, Count, Circuits)` in `RenderCircuit.cpp`: allocates the shared `RENDER_DEVICE_CONTEXT` once, then loops the existing parameterized `CodecR_CreateRenderCircuit` once per channel (distinct GUID + name each).
- `Codec_EvtBusDeviceAdd`: initializes the array, calls `CodecR_AddStaticRenderMulti(device, g_AudappRenderChannels, 4, devCtx->Render)`; capture creation unchanged.
- `Codec_EvtDevicePrepareHardware`: loops `AcxDeviceAddCircuit` over each non-null `Render[i]` (each individually null-guarded); capture attach unchanged.
- `Codec_EvtDeviceReleaseHardware`: loops `AcxDeviceRemoveCircuit` over each non-null `Render[i]`; capture removal unchanged.
- ACX 1.0 targeting preserved (`acx\km\1.0`, `ACX_VERSION_MINOR=0` in the compile command).
- Existing `AUDAPP_DIAG_STARTUP_BISECT` guards and trace patterns preserved.

## 6. INF Changes (`AudioMulti.inf`, Audapp-owned)

- New separate-identity INF: `ROOT\AudappMulti`, `Audapp Multi`, service/binary `AudioMulti`, `CatalogFile=AudioMulti.cat`, `DriverVer 2.0.0.0`, `PnpLockDown=1`, Class MEDIA, KMDF.
- Four render interface sections (`[Audio_Device.I.SpeakerGeneral|Music|Voice|Game]`), each with FriendlyName `Audapp General|Music|Voice|Game` and a unique reference string, registered under `KSCATEGORY_AUDIO` / `KSCATEGORY_RENDER` / `KSCATEGORY_REALTIME`.
- One capture interface retained (`Microphone0`, FriendlyName `Audapp Multi Microphone`) for parity with the still-single capture circuit.

## 7. INF ↔ Endpoint Binding Conclusion (Phase 21A central unknown — RESOLVED)

**Binding mechanism:** Windows publishes one MMDevice endpoint per INF `AddInterface` *reference string*; the endpoint's FriendlyName comes from that interface's `AddReg`. The reference string is bound to an ACX circuit by **exact string equality** between the reference string and the circuit name assigned via `AcxCircuitInitAssignName`. This is confirmed by the sample's own contract — `DriverSettings.h` states: *"This string must match the string defined in AudioCodec.inf for the speaker name"* (`renderCircuitName = L"Speaker0"` ↔ `KSNAME_Speaker = "Speaker0"`).

**Applied here:** `Channels.h` circuit names (`SpeakerGeneral`/`SpeakerMusic`/`SpeakerVoice`/`SpeakerGame`) are character-for-character identical to the `AudioMulti.inf` reference strings (`KSNAME_Speaker*`), and each interface section carries the matching FriendlyName. So each of the four render circuits is expected to surface as its own named endpoint:

```
Render circuit "SpeakerGeneral" ↔ INF ref "SpeakerGeneral" ↔ FriendlyName "Audapp General"
Render circuit "SpeakerMusic"   ↔ INF ref "SpeakerMusic"   ↔ FriendlyName "Audapp Music"
Render circuit "SpeakerVoice"   ↔ INF ref "SpeakerVoice"   ↔ FriendlyName "Audapp Voice"
Render circuit "SpeakerGame"    ↔ INF ref "SpeakerGame"    ↔ FriendlyName "Audapp Game"
```

This is a **static / compile-time** resolution. Final proof that all four endpoints actually appear (and carry the right FriendlyNames) is only observable at runtime and is deferred to the VM install-test (Phase 21C). It is **not a blocker** for proceeding to 21C.

## 8. Build / Stage Result

- Toolchain: VS 18.6 Community (MSVC 14.51), WDK `10.0.28000.0`, KMDF 1.31, ACX 1.0.
- MSBuild flags: `SignMode=Off /p:DriverPackage=False /p:SupportsPackaging=false` (compile-only; no packaging/inf2cat).
- **Result: `Oluşturma başarılı oldu. 0 Uyarı / 0 Hata`** (Build succeeded, 0 warnings, 0 errors) — note `/WX` (warnings-as-errors) was on.
- StampInf stamped `AudioMulti.inf`; Link produced `AudioMulti.sys`; ApiValidator passed ("Windows Driver"); DrvCat skipped (no catalog — expected).
- Elapsed: ~13.5 s. Binlog: `project/build/AudioMulti-Debug-x64.binlog`.

## 9. Staged Artifact Paths

```
driver/scaffold/audapp-multi/package/Debug/x64/AudioMulti.sys   (98,816 bytes)
driver/scaffold/audapp-multi/package/Debug/x64/AudioMulti.inf   (7,130 bytes, stamped)
driver/scaffold/audapp-multi/package/Debug/x64/package-manifest.txt
```
Raw build output: `project/upstream-audiocodec/x64/Debug/AudioMulti.sys`. (`AudioMulti.cat` not generated — not required for compile-only; `Generate-Catalog.ps1` can produce it later if needed.)

## 10. Confirmation: No Install / Load Operations

Explicitly confirmed — **none** of the following ran at any point in Phase 21B: `pnputil`, `devgen`, `devcon install` (only read-only `devcon status`), `bcdedit`, driver install/load/enable, driver-store mutation, test-signing. The build used `SignMode=Off` and no packaging. Only compile + file staging into the repo tree occurred.

## 11. Live `Audapp Input` Untouched

Confirmed. `oem19.inf` and the `ROOT\AudappInput` driver-store package were not read-modified, deleted, or replaced. The live device reports the same healthy state before and after (§1). The experimental package uses an entirely separate identity (§3) and was only staged into the repo, never installed.

## 12. Recommendation for Phase 21C

**Proceed to Phase 21C (VM-only install-test) when the user approves** — the central Phase 21A unknown (INF↔endpoint binding) is resolved statically, the package compiles cleanly on ACX 1.0 with a separate identity, and the live stack is provably unaffected.

Phase 21C must remain strictly VM-only and gated:
- VM snapshot first (hard gate); test-signing in the VM only.
- Install the separate `AudioMulti` package (`pnputil /add-driver`) + create one `ROOT\AudappMulti` devnode (`devgen`); leave `Audapp Input` installed and untouched.
- Verify all four render endpoints appear with correct FriendlyNames (e.g. `audapp_endpoint_probe`), then verify playability.
- **Stop on Code 37 or any missing/misnamed endpoint**; revert to snapshot. `pnputil /delete-driver` of the *multi* package only as documented manual rollback.
- Promotion to a live default remains a separate, explicitly-approved phase.

**Verdict:** ✅ 21B complete and clean. ▶ 21C may proceed in a VM on user approval. 🔒 Live product unchanged (still single-endpoint / user-mode channels).
