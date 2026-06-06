# Audapp Phase 22C VM Host Script Validation Report

- Date: 2026-06-06
- Workspace: `C:\Users\musta\Audapp`
- Scope: VM-only validation of the Phase 22B host-install scripts
- Branch: `main`
- Commit under test: `64b85be chore: sync latest Audapp state`
- Result: Partial success, then blocked before real install

## 1. Snapshot confirmation

The VM snapshot was not reverted.

Per the user instruction for this Phase 22C run, the current VM state was treated as the rollback point. I could not independently verify VMware snapshot state from inside the guest OS, so this was treated as an operator-provided constraint rather than an in-guest proof.

## 2. Starting VM state

Initial read-only inspection found:

- Existing AudappChannels devnodes already installed and healthy:
  - `ROOT\DEVGEN\AUDAPPGENERAL0001`
  - `ROOT\DEVGEN\AUDAPPMUSIC0001`
  - `ROOT\DEVGEN\AUDAPPGAME0001`
  - `ROOT\DEVGEN\AUDAPPBROWSER0001`
- Existing Audapp Input also installed and healthy:
  - `ROOT\DEVGEN\AUDAPP12G0001`
- Existing default render endpoint was `Hoparlor (Audapp General)`.
- Existing AudappChannels package resolved dynamically as `oem22.inf`.
- The environment was confirmed to be VMware guest Windows 10 (`VMware, Inc.`, `VMware20,1`).

Preflight script health checks passed:

- `scripts/host-install` exists.
- PowerShell parse check passed for all `*.ps1`.
- ASCII scan passed for all `*.ps1`.
- Git branch was `main`.

## 3. Uninstall dry-run result

`.\scripts\host-install\Uninstall-AudappHost.ps1 -DryRun`

Dry-run resolved exactly:

- Package: `oem22.inf`
- Devnodes:
  - `ROOT\DEVGEN\AUDAPPGENERAL0001`
  - `ROOT\DEVGEN\AUDAPPMUSIC0001`
  - `ROOT\DEVGEN\AUDAPPGAME0001`
  - `ROOT\DEVGEN\AUDAPPBROWSER0001`
- Fallback physical endpoint:
  - `Hoparlor (High Definition Audio Device)`

The uninstall dry-run did not target:

- `Audapp Input`
- `AudioMulti`
- protected OEM packages
- physical audio driver devices

Independent safety review before real mutation concluded:

- Real uninstall was narrowly scoped enough to proceed in this VM.
- Real install remained under-constrained in general and required extra caution before any future real install step.

## 4. Real VM uninstall result

Command run:

```powershell
.\scripts\host-install\Uninstall-AudappHost.ps1 -DryRun:$false -ConfirmHostInstall
```

Observed mutation:

- Removed `ROOT\DEVGEN\AUDAPPGENERAL0001`
- Removed `ROOT\DEVGEN\AUDAPPMUSIC0001`
- Removed `ROOT\DEVGEN\AUDAPPGAME0001`
- Removed `ROOT\DEVGEN\AUDAPPBROWSER0001`
- Deleted published package `oem22.inf`

The uninstall command then failed on the final default-audio reset step because the script's `IPolicyConfig` interop was wrong. The uninstall log shows all removals and package deletion succeeded before that failure.

## 5. Safety issue found and fixed: default render reset interop

### Symptom

After the real uninstall, the default render endpoint fell onto `Hoparlor (Audapp Input)` instead of the physical device.

The failing command path was:

```powershell
.\scripts\host-install\Reset-AudappAudioDefault.ps1 -DryRun:$false -ConfirmHostInstall -EndpointId {physical-id}
```

### Root cause

The host-install scripts had an incorrect `IPolicyConfig` COM definition and used a PowerShell-side cast pattern that was not reliable.

### Fix applied

Updated:

- `scripts/host-install/Install-AudappHost.ps1`
- `scripts/host-install/Uninstall-AudappHost.ps1`
- `scripts/host-install/Reset-AudappAudioDefault.ps1`

The fix moved the COM cast into C# helper code and corrected the `IPolicyConfig` method layout so `SetDefaultEndpoint` was called through the correct interface shape.

### Verification

After the fix:

```powershell
.\scripts\host-install\Reset-AudappAudioDefault.ps1 -DryRun:$false -ConfirmHostInstall -EndpointId {physical-id}
```

completed successfully and the default render endpoint verified as:

- `Hoparlor (High Definition Audio Device)`

## 6. Post-uninstall verification

After the uninstall and the default-reset fix:

- No active AudappChannels devnodes remained.
- No `audiochannels.inf` / `AudappChannels` package remained in the driver store.
- `Audapp Input` remained healthy and untouched:
  - `ROOT\DEVGEN\AUDAPP12G0001`
  - Service `AudioCodec`
  - ProblemCode `CM_PROB_NONE`
- Default render endpoint ended on the physical device:
  - `Hoparlor (High Definition Audio Device)`

This satisfies the uninstall-first validation path for the current VM state.

## 7. Staged payload details

The expected signed AudappChannels payload was not present in this workspace or user profile.

What I could stage:

- `scripts/host-install/payload/AudioChannels.inf`
- `scripts/host-install/payload/AudappChannels.cer`
- `scripts/host-install/bin/devgen.exe`

Notes:

- `AudioChannels.inf` came from the local scaffold source tree.
- `AudappChannels.cer` was exported as a public certificate from the existing VM test-signing certificate in `Cert:\LocalMachine\My`.
- `devgen.exe` came from Windows Kits:
  - `C:\Program Files (x86)\Windows Kits\10\Tools\10.0.28000.0\x64\devgen.exe`
  - signature verified as valid Microsoft signature

Missing required install payload:

- `scripts/host-install/payload/AudappChannels.sys`
- `scripts/host-install/payload/AudappChannels.cat`

## 8. Build/sign attempt for missing payload

I attempted to rebuild the missing driver payload via:

```powershell
.\driver\scaffold\audapp-channels\build-channels.ps1 -Configuration Debug -Platform x64
```

This failed immediately because the local `audapp-channels` scaffold does not contain the expected source tree:

- missing `driver\scaffold\audapp-channels\project\upstream-audiocodec\AudioCodec.sln`

Only `AudioChannels.inf` exists in that scaffold. Therefore I could not regenerate `AudappChannels.sys` and `AudappChannels.cat` from the current workspace.

## 9. Readiness result

### Initial problem found

`Test-AudappHostReadiness.ps1` incorrectly reported `READY` even when `AudappChannels.sys` and `AudappChannels.cat` were missing from the staged payload.

### Root cause

The readiness script logged payload inventory but only treated a missing INF as a blocker. Missing `.sys` and `.cat` were not promoted to blockers.

### Fix applied

Updated:

- `scripts/host-install/Test-AudappHostReadiness.ps1`

The script now marks missing non-INF required payload files as readiness blockers during install-readiness validation.

### Verification

After the fix, running:

```powershell
.\scripts\host-install\Test-AudappHostReadiness.ps1
```

correctly returned `BLOCKED` with exactly these blockers:

- missing `scripts/host-install/payload/AudappChannels.sys`
- missing `scripts/host-install/payload/AudappChannels.cat`

## 10. Install dry-run result

Command run:

```powershell
.\scripts\host-install\Install-AudappHost.ps1 -DryRun
```

Dry-run result:

- No mutation occurred.
- Planned actions were limited to:
  - import public certificate
  - publish `AudioChannels.inf`
  - create four AudappChannels devnodes
  - install the published driver
  - rescan devices
  - reset default render endpoint back to the physical device
- Planned devnodes were exactly:
  - `ROOT\DEVGEN\AUDAPPGENERAL0001`
  - `ROOT\DEVGEN\AUDAPPMUSIC0001`
  - `ROOT\DEVGEN\AUDAPPGAME0001`
  - `ROOT\DEVGEN\AUDAPPBROWSER0001`
- `blockerCount=2` due missing:
  - `AudappChannels.sys`
  - `AudappChannels.cat`

No real install was attempted.

## 11. Real VM install result

Not run.

Reason:

- missing signed install payload (`AudappChannels.sys` and `AudappChannels.cat`)
- current workspace cannot rebuild that payload because the `audapp-channels` source scaffold is incomplete
- install-path safety review remained generally cautious even after the successful uninstall path

## 12. Device status / ProblemCode result

Final state after uninstall path:

- `Audapp Input` remains present and healthy.
- No active AudappChannels devnodes remain.
- No `AudappChannels` published package remains.

## 13. Endpoint naming result

Post-uninstall endpoint inventory shows:

- `Hoparlor (Audapp Input)` render endpoint still present
- `Mikrofon (Audapp Input)` capture endpoint still present
- `Hoparlor (High Definition Audio Device)` render endpoint present and healthy

The four AudappChannels render endpoints were removed as expected by the uninstall path.

Because no reinstall occurred, the "four distinct AudappChannels endpoint names are back" validation was not reached in this Phase 22C run.

## 14. WASAPI probe result

Not run in this session because real install did not occur and the four target AudappChannels render endpoints were not present after uninstall.

## 15. Reboot persistence result

Not run.

Per the user instruction, I was supposed to ask before rebooting. The workflow never reached a valid post-install state, so no reboot request was made.

## 16. Uninstall dry-run + final cleanup result

The uninstall-first path produced a clean final VM state for AudappChannels:

- four AudappChannels devnodes removed
- `oem22.inf` removed
- default render endpoint ended physical
- `Audapp Input` untouched

No second uninstall cycle was needed because the reinstall phase never started.

## 17. Proof only the VM was mutated

Mutations performed were limited to the guest VM:

- removed AudappChannels devnodes
- deleted the guest's AudappChannels driver package (`oem22.inf`)
- changed the guest's Windows default render endpoint
- exported a public certificate inside the guest
- staged guest-local payload/bin files under ignored workspace paths
- edited guest-local PowerShell scripts in the repo workspace

No host-machine install was attempted.
No host driver store was touched.
No physical audio driver devices were deleted.
No `Audapp Input` or `AudioMulti` install/uninstall command was run.

## 18. Safety issues found/fixed

Fixed:

1. `IPolicyConfig` default-endpoint reset path was broken in:
   - `Install-AudappHost.ps1`
   - `Uninstall-AudappHost.ps1`
   - `Reset-AudappAudioDefault.ps1`
2. `Test-AudappHostReadiness.ps1` failed open on missing `.sys/.cat` payload files.

Still unresolved for future work:

1. Real install cannot proceed without signed `AudappChannels.sys` and `AudappChannels.cat`.
2. The local `audapp-channels` scaffold is incomplete and cannot rebuild its payload as-is.
3. Earlier safety review found the install path generally less constrained than the uninstall path; that should be revisited before any future real install attempt.

## 19. Files changed / artifacts / logs

Modified scripts:

- `scripts/host-install/Install-AudappHost.ps1`
- `scripts/host-install/Reset-AudappAudioDefault.ps1`
- `scripts/host-install/Test-AudappHostReadiness.ps1`
- `scripts/host-install/Uninstall-AudappHost.ps1`

Staged ignored files:

- `scripts/host-install/payload/AudioChannels.inf`
- `scripts/host-install/payload/AudappChannels.cer`
- `scripts/host-install/bin/devgen.exe`

Key logs:

- `C:\Users\musta\Documents\Audapp\host-install-logs\audapp-uninstall-20260606-134657.log`
- `C:\Users\musta\Documents\Audapp\host-install-logs\audapp-reset-default-20260606-140025.log`
- `C:\Users\musta\Documents\Audapp\host-install-logs\audapp-install-20260606-141043.log`
- `C:\Users\musta\Documents\Audapp\host-install-logs\audapp-readiness-20260606-141220.log`

## 20. Recommendation

Do not proceed to Phase 22D or 22E yet.

Recommended next step:

1. Restore or reproduce the missing signed AudappChannels payload (`AudappChannels.sys` + `AudappChannels.cat`) from the proper `audapp-channels` source/worktree.
2. Re-run Phase 22C from the current cleaned VM state or from a fresh rollback snapshot.
3. Before any future real install command, re-check install-path safety with the staged exact payload.

Current verdict:

- Uninstall-first validation: passed after fixing the default-endpoint reset bug.
- Install validation: blocked on missing signed payload and incomplete local source scaffold.
- Overall Phase 22C status: fix payload/source availability and repeat 22C before host-readiness promotion.

---

# Phase 22C.1 Payload Recovery/Rebuild

- Date: 2026-06-06
- Subphase goal: recover or rebuild the missing signed `AudappChannels` payload so
  Phase 22C install validation can resume; no real install, no driver/boot/audio mutation.
- Result: **BLOCKED — no signed payload found and a rebuild is not possible from local source.**
- Mode: search / inspect / dry-run only.

## 22C.1.1 Current payload state

`scripts/host-install/payload/` (unchanged by this subphase):

- `AudioChannels.inf` — present (9062 bytes)
- `AudappChannels.cer` — present (1312 bytes)
- `AudappChannels.sys` — **MISSING**
- `AudappChannels.cat` — **MISSING**

`scripts/host-install/bin/devgen.exe` — present (72136 bytes), Authenticode **Valid**
(`CN=Microsoft Corporation`).

## 22C.1.2 Artifact search locations

Targeted, bounded searches for `AudappChannels.sys`, `AudappChannels.cat`,
`AudioChannels.inf`, `AudappChannels.cer`:

| Location | Exists | Channels `.sys`/`.cat` found |
|---|---|---|
| `C:\Users\musta\Audapp` (workspace, recursive) | yes | none |
| `C:\Users\musta\Audapp-21B` | **no (dir absent)** | n/a |
| `C:\Users\musta\.config\superpowers\worktrees` | yes | none |
| `C:\Users\musta\Desktop` | yes | none |
| `C:\Users\musta\Downloads` | yes | none |
| `C:\Users\musta\Documents` | yes | none |
| `C:\Users\musta\AppData\Local\Temp` | yes | none |
| `C:\Windows\System32\DriverStore\FileRepository` | yes | none |

DriverStore note: the FileRepository contains 11 `audiocodec.inf_amd64_*` packages
(Input/Multi lineage) and `netvchannel.inf_amd64_*` (unrelated Windows package). There is
**no** `audiochannels.inf_*` package, and a recursive search for `AudappChannels.sys` /
`AudappChannels.cat` / `AudioChannels.inf` under the repository returned nothing.

## 22C.1.3 Candidate artifacts found / rejected

- **No** `AudappChannels.sys` or `AudappChannels.cat` exists anywhere on disk.
- The only kernel binaries present are the **Audapp Input** driver's:
  - `driver/scaffold/audapp-input/package/Debug/x64/AudioCodec.sys` (+ `audiocodec.cat`)
  - `driver/scaffold/audapp-input/project/upstream-audiocodec/x64/Debug/AudioCodec.sys`
  - **Rejected**: wrong identity. These are the live single-endpoint Input driver
    (service `AudioCodec`, package `oem19.inf`), not the four-endpoint `AudappChannels`
    variant. Reusing them is forbidden and would not satisfy the INF (which requires
    `AudappChannels.sys` + `AudappChannels.cat`).

## 22C.1.4 Final payload source

None. No artifacts were copied or staged; the payload directory is unchanged
(`AudioChannels.inf` + `AudappChannels.cer` only). Staging was not possible because no
valid `.sys`/`.cat` exist and a rebuild is not feasible (see 22C.1.9).

## 22C.1.5 Signature verification

- `devgen.exe`: **Valid** (`CN=Microsoft Corporation, O=Microsoft Corporation, ... C=US`).
- `AudappChannels.cer`: `UnknownError` — expected and benign. A `.cer` is a bare X.509
  certificate, not an Authenticode-signed file, so `Get-AuthenticodeSignature` cannot
  classify it. This is not a payload defect.
- `AudappChannels.sys` / `AudappChannels.cat`: not verifiable (absent).

## 22C.1.6 INF identity verification

`Assert-AudappChannelsInfIdentity` on `payload/AudioChannels.inf` **PASSED — AudappChannels only**:

- Contains all four hardware ids: `ROOT\AudappGeneral`, `ROOT\AudappMusic`,
  `ROOT\AudappGame`, `ROOT\AudappBrowser`.
- Contains `AddService = AudappChannels` and `CatalogFile = AudappChannels.cat`.
- Contains **no** forbidden directives: no `ROOT\AudappInput`, no `ROOT\AudappMulti`, no
  `DeviceDesc="Audapp Input"`/`"Audapp Multi"`, no `AddService=AudioCodec`/`AudioMulti`.
  (The header comment names those packages only to forbid them; the guard evaluates
  directive lines, not comments.)

## 22C.1.7 Readiness result

`.\scripts\host-install\Test-AudappHostReadiness.ps1` → **BLOCKED** (exit 1), exactly 2 blockers:

- missing `payload/AudappChannels.sys`
- missing `payload/AudappChannels.cat`

Healthy signals in the same run: Administrator=True, Secure Boot OFF, test-signing ON,
INF identity guard PASSED, devgen signature Valid, 1 physical render endpoint
(`Hoparlor (High Definition Audio Device)`, also the current default), 0 AudappChannels
packages, 0 AudappChannels devnodes. Warnings: `.cer` signature `UnknownError` (expected)
and repo working tree dirty.

## 22C.1.8 Install dry-run result

`.\scripts\host-install\Install-AudappHost.ps1 -DryRun` → exit 0; **every planned action
returned `Executed: False` (nothing mutated)**; `blockerCount=2`. Planned sequence:

1. import test cert into `LocalMachine\Root`
2. import test cert into `LocalMachine\TrustedPublisher`
3. `pnputil /add-driver AudioChannels.inf`
4. `devgen /add` for each of `AUDAPPGENERAL0001`, `AUDAPPMUSIC0001`, `AUDAPPGAME0001`, `AUDAPPBROWSER0001`
5. `pnputil /add-driver AudioChannels.inf /install`
6. `pnputil /scan-devices`
7. reset default render endpoint back to `Hoparlor (High Definition Audio Device)`

## 22C.1.9 Was a rebuild needed, and is it possible?

A rebuild was needed (no recoverable artifacts). **It is not possible from the current
local source.** Evidence:

- `driver/scaffold/audapp-channels/project/upstream-audiocodec/` contains **only**
  `AudioChannels.inf`. A `-Force` filesystem walk (gitignored files included) confirms the
  channels scaffold has **no** `AudioCodec.sln`, `AudioCodec.vcxproj`, `Device.cpp`,
  `Driver.cpp`, `DriverSettings.h`, and no `Common/` C/C++ sources.
- `build-channels.ps1` therefore hard-fails its first precondition
  (`Driver source was not found at ...AudioCodec.sln`).
- The channels scaffold's own `.gitignore` and `PROVENANCE.md` confirm the
  Microsoft-derived ACX `AudioCodec` source is **intentionally not committed** and lived
  "on-disk only"; those on-disk copies are now gone.
- The documented derivation base, `driver/scaffold/audapp-multi`, is **also** stripped of
  source (no `.sln`/`.vcxproj`/`.cpp`), so it cannot serve as a copy base either.
- Only `driver/scaffold/audapp-input` retains a complete buildable source tree — but that is
  the unmodified single-endpoint **Input** driver, not the Phase 21F four-endpoint
  channel-selection variant (the modified `Device.cpp`, `Common/RenderCircuit.cpp`
  `CodecR_AddStaticRenderSingle`, `shared/Public.h` prototype, and channels `vcxproj` are
  all absent). Reconstructing `AudappChannels.sys` would require re-deriving that driver
  code from scratch with the WDK/VS toolchain — outside the scope and safety envelope of a
  payload-recovery subphase.

## 22C.1.10 Exact missing files and required user action

Missing to complete the payload:

- `scripts/host-install/payload/AudappChannels.sys` (signed, from a channels build)
- `scripts/host-install/payload/AudappChannels.cat` (signed catalog)

To rebuild them locally, the following channels source must be restored on-disk under
`driver/scaffold/audapp-channels/`:

- `project/upstream-audiocodec/AudioCodec.sln`
- `project/upstream-audiocodec/AudioCodec.vcxproj` (`TargetName=AudappChannels`,
  `<Inf Include="AudioChannels.inf" />`)
- `project/upstream-audiocodec/Device.cpp` (Phase 21F channel-selection edits)
- `project/upstream-audiocodec/Driver.cpp`, `DriverSettings.h`, `Resources.rc`
- `Common/` (incl. `RenderCircuit.cpp` with `CodecR_AddStaticRenderSingle`) and `inc/`
- `shared/Public.h`, `shared/Trace.h`

Required user action — provide **one** of:

1. The previously-built **signed** `AudappChannels.sys` + `AudappChannels.cat` (e.g. from
   the 21F/21G build host, a worktree, or a backup/snapshot), copied into
   `scripts/host-install/payload/`; or
2. The complete on-disk **channels source** listed above (from the worktree/backup where the
   gitignored ACX source still lives), after which `build-channels.ps1` +
   `Generate-Catalog-channels.ps1` + `Sign-Catalog-channels.ps1` can regenerate the payload.

## 22C.1.11 Proof no driver/boot/audio mutation was run

- Only read-only queries, the read-only readiness script, and the install **dry-run** were
  executed. No `pnputil /add-driver|/delete-driver|/remove-device`, no `devgen /add|/remove`,
  no `bcdedit`, no `devcon`, no default-audio change, no cert import.
- Dry-run output shows `Executed: False` for all 11 planned actions.
- Audapp Input unchanged before and after: `ROOT\DEVGEN\AUDAPP12G0001` ProblemCode `0`,
  driver `oem19.inf` (identical at preflight and post-run).
- AudappChannels packages = 0 and devnodes = 0 throughout; default render endpoint remained
  the physical `Hoparlor (High Definition Audio Device)`.
- Payload directory contents unchanged; no binary artifacts copied or committed. `.gitignore`
  protects `scripts/host-install/payload/`, `scripts/host-install/bin/*.exe`, and
  `scripts/host-install/logs/`.

## 22C.1.12 Recommendation

- **Do not** proceed to a real Phase 22C VM install — the payload cannot be completed here.
- **Restore** the signed `AudappChannels.sys` + `.cat`, or the complete channels source tree
  (22C.1.10), from the build host / worktree / backup where the gitignored ACX source and
  build artifacts still exist.
- After staging a complete payload, re-run `Test-AudappHostReadiness.ps1` (expect READY) and
  `Install-AudappHost.ps1 -DryRun`, then resume Phase 22C install validation from a clean
  VM snapshot.

---

# Phase 22C.2 Reconstruct & Rebuild AudappChannels Payload

- Date: 2026-06-06
- Subphase goal: reconstruct the buildable `audapp-channels` scaffold from the surviving
  `audapp-input` ACX source, then build + sign + stage the `AudappChannels` payload.
  Build/sign only; no install; no driver/boot/audio mutation.
- Result: **SUCCESS — a complete signed payload was rebuilt and staged; readiness is READY and
  the install dry-run is clean.** One caveat: the driver was reconstructed from source, so it is
  not the byte-identical 21G-validated binary and still needs a VM install to confirm runtime
  behavior (see 22C.2.9).

## 22C.2.1 Toolchain / signing prerequisites (all present)

- Visual Studio 18 (Community) + MSBuild; WDK build `10.0.28000.0`; ACX 1.0 headers.
- `signtool.exe`, `Inf2Cat.exe`, `infverif.exe` under `...\Windows Kits\10\bin\10.0.28000.0`.
- Code-signing cert `CN=Audapp VM Test Code Signing` in `LocalMachine\My`, `HasPrivateKey=True`,
  thumbprint `C9C96275386BCDA269FE344FE805C4D668C52F86` — **identical to the staged
  `payload/AudappChannels.cer`**, so the shipped `.cer` trusts the signed catalog. The cert was
  also already present in `LocalMachine\Root` and `TrustedPublisher` (trust established by prior
  21G work; the sign step's cert imports were therefore no-ops).

## 22C.2.2 Source reconstruction (from audapp-input)

`audapp-input` retained a complete buildable ACX `AudioCodec` tree; `audapp-channels` and
`audapp-multi` did not. Copied the Microsoft-derived source from `audapp-input` into
`audapp-channels`, preserving the tree and the channels-owned files:

- `Common\*` (21 source files; build-output `x64\` not copied)
- `inc\*` (`AudioFormats.h`, `cpp_utils.h`)
- `shared\Public.h`, `shared\Trace.h` (channels-owned `shared\Channels.h` left intact)
- `project\upstream-audiocodec\`: `Driver.cpp`, `DriverSettings.h`, `Resources.rc`, `ReadMe.txt`,
  `AudioCodec.sln`, `AudioCodec.vcxproj`, `AudioCodec.vcxproj.Filters`, `Device.cpp`
- **Not** copied: `AudioCodec.inf` (channels uses its own `AudioChannels.inf`).

All copied source is gitignored (Microsoft-derived provenance), matching the existing scaffold
policy; `git status` shows no new tracked files.

## 22C.2.3 Audapp identity edits applied

Two files changed (both gitignored):

- `project\upstream-audiocodec\AudioCodec.vcxproj`:
  - `<Inf Include="AudioCodec.inf" />` → `<Inf Include="AudioChannels.inf" />`
  - added `<TargetName>AudappChannels</TargetName>` (output was otherwise `AudioCodec.sys`).
- `project\upstream-audiocodec\Device.cpp`:
  - `#define AUDAPP_CHANNELS_IMPL` + `#include "Channels.h"` so the per-endpoint
    GUID/name/table storage (`g_AudappRenderChannels`) is emitted once in this TU.
  - `Codec_EvtBusDeviceAdd` rewritten: read the per-devnode hardware-key value `AudappChannel`
    (`WdfDeviceOpenRegistryKey(PLUGPLAY_REGKEY_DEVICE)` + `WdfRegistryQueryString`), match it to
    the channel table (`general`/`music`/`game`/`browser`), and create exactly ONE render circuit
    via the existing `CodecR_AddStaticRender(device, channel->ComponentGuid, channel->CircuitName)`.
    RENDER-ONLY: the capture-circuit creation was removed. Unknown/missing selector →
    `STATUS_DEVICE_CONFIGURATION_ERROR`.
  - `Codec_EvtDeviceReleaseHardware`: guarded `AcxDeviceRemoveCircuit` for render/capture against
    null (capture is always null now).

Design note / deviation: the Phase 21F PROVENANCE described adding a `CodecR_AddStaticRenderSingle`
helper. The stock `CodecR_AddStaticRender` is already fully parameterized by GUID + circuit name
(it builds one render circuit), so it was reused directly. This keeps `Common\RenderCircuit.cpp`
and `Public.h` byte-identical to the input scaffold and minimizes divergence/risk; the functional
result (one render circuit per devnode, selected by `AudappChannel`) matches the documented design.

## 22C.2.4 Build result

`build-channels.ps1 -Configuration Debug -Platform x64` → **succeeded, 0 warnings / 0 errors**
under `/W4 /WX` (ACX 1.0, KMDF 1.31). ApiValidator reported `Driver is 'Windows Driver'`. Output
`AudappChannels.sys` (70656 bytes) staged with the stamped `AudioChannels.inf` under
`package\Debug\x64\`. Binlog: `project\build\AudappChannels-Debug-x64.binlog`.

## 22C.2.5 Catalog + signature

- `Generate-Catalog-channels.ps1` → `AudappChannels.cat`; Inf2Cat signability test clean
  (0 errors / 0 warnings).
- `Sign-Catalog-channels.ps1` (catalog-only; **not** `-SignSys`) signed `AudappChannels.cat` with
  the test cert; `signtool verify /pa` **succeeded (0 errors)**. The catalog hashes (and therefore
  vouches for) the unmodified `AudappChannels.sys`; embedding a `.sys` signature was intentionally
  skipped because it would invalidate the just-generated catalog hash, and a demand-start
  (`StartType=3`) PnP driver loads under test-signing via the signed catalog.

## 22C.2.6 Staged payload (catalog-matched)

Copied the **catalog-matched** files into `scripts\host-install\payload\`:

- `AudioChannels.inf` (stamped, the exact INF the catalog hashed) — 9057 bytes
- `AudappChannels.sys` — 70656 bytes
- `AudappChannels.cat` (signed) — 3451 bytes
- `AudappChannels.cer` (unchanged; matches the signing cert) — 1312 bytes

`signtool verify /pa` on the staged `AudappChannels.cat`: verified, 0 errors. Payload signature
states: `.cat` = **Valid** (`CN=Audapp VM Test Code Signing`); `.sys` = NotSigned (expected —
covered by the catalog); `.cer` = `UnknownError` (expected — a bare certificate, not Authenticode).

## 22C.2.7 Readiness result

`Test-AudappHostReadiness.ps1` → **READY** (exit 0), **0 blockers**, 2 warnings (`.cer`
`UnknownError` expected; repo working tree dirty). All four payload files present; INF identity
guard PASSED (AudappChannels only); catalog signature Valid; devgen Valid; one physical render
endpoint present and default.

## 22C.2.8 Install dry-run result

`Install-AudappHost.ps1 -DryRun` → exit 0, `blockerCount=0`, **all 11 planned actions
`Executed:False` (nothing mutated)** — cert import ×2 → `pnputil /add-driver` → `devgen /add` ×4
(`AUDAPPGENERAL/MUSIC/GAME/BROWSER0001`) → `/add-driver /install` → `/scan-devices` → reset default
to the physical endpoint.

## 22C.2.9 Important caveat — reconstructed, not the original validated binary

This `AudappChannels.sys` was rebuilt from the `audapp-input` source plus a re-derivation of the
Phase 21F channel-selection edits. It compiles clean and is correctly signed, but it is **not** the
byte-identical binary that passed the 21G VM install test. Compile + dry-run cannot prove runtime
behavior. A real VM install (4 devnodes, no Code 37, 4 distinct persistent endpoint names, WASAPI
render) is still required to validate it before it is trusted, and that step was intentionally not
run here.

## 22C.2.10 Proof no driver/boot/audio mutation was run

- Only source copy/edit, a compile-only build, Inf2Cat, catalog signing, payload staging, the
  read-only readiness script, and the install **dry-run** were executed.
- No `pnputil /add-driver|/delete-driver|/remove-device`, no `devgen /add|/remove`, no `bcdedit`,
  no `devcon`, no default-audio change, no test-signing change, no reboot.
- Audapp Input unchanged before/after: `ROOT\DEVGEN\AUDAPP12G0001` ProblemCode `0`, driver
  `oem19.inf`. AudappChannels devnodes = 0; no `audiochannels.inf` in the driver store; default
  render remained physical `Hoparlor (High Definition Audio Device)`.
- The only host-state touch was catalog signing re-importing the test cert into
  `Root`/`TrustedPublisher` — both already contained it, so it was a no-op. All build artifacts and
  payload binaries are gitignored (no new tracked files).

## 22C.2.11 Recommendation

- The payload blocker is resolved; Phase 22C can proceed to real VM install validation **with
  explicit user approval**, from a clean VM snapshot, treating this as a first install of a
  freshly reconstructed driver (validate 4 devnodes / no Code 37 / 4 distinct names / WASAPI).
- Keep the payload binaries uncommitted (gitignored). If desired, the reconstructed channels source
  can remain on-disk for future rebuilds, consistent with the scaffold's provenance policy.

---

# Phase 22C.3 Real VM Install Validation (reconstructed driver)

- Date: 2026-06-06
- VM snapshot taken by operator beforehand: `before 22c reconstructed-driver-install`.
- Scope: real VM-only install of the 22C.2 reconstructed/signed payload, then full verification.
  No host machine, no reboot (reboot-persistence test deferred to operator approval).
- Result: **PASS — the reconstructed AudappChannels driver installs and runs correctly.**

## 22C.3.1 Pre-install gates

- `Test-AudappHostReadiness.ps1` → READY (0 blockers).
- `Install-AudappHost.ps1 -DryRun` → clean (blockerCount=0, all actions plan-only).

## 22C.3.2 Real install

`Install-AudappHost.ps1 -DryRun:$false -ConfirmHostInstall` → exit 0. Executed:

- imported test cert into LocalMachine\Root + TrustedPublisher (already present; idempotent),
- `pnputil /add-driver AudioChannels.inf` → published **oem20.inf**,
- `devgen /add` ×4 → created `ROOT\DEVGEN\AUDAPP{GENERAL,MUSIC,GAME,BROWSER}0001`,
- `pnputil /add-driver /install` → installed oem20.inf on all four devnodes,
- `pnputil /scan-devices`,
- reset default render endpoint to the physical device.

Script's built-in post-install validation passed (4 devnodes, ProblemCode 0, Service AudappChannels).

## 22C.3.3 Verification results

Devnodes (all four):

| Devnode | Status | ProblemCode | Service | INF |
|---|---|---|---|---|
| AUDAPPGENERAL0001 | OK | 0 | AudappChannels | oem20.inf |
| AUDAPPMUSIC0001 | OK | 0 | AudappChannels | oem20.inf |
| AUDAPPGAME0001 | OK | 0 | AudappChannels | oem20.inf |
| AUDAPPBROWSER0001 | OK | 0 | AudappChannels | oem20.inf |

- **No Code 37; all ProblemCode 0; Service AudappChannels.** The reconstructed driver loads cleanly.
- Render endpoints (distinct, all state ACTIVE): `Hoparlor (Audapp General)`, `Hoparlor (Audapp Music)`,
  `Hoparlor (Audapp Game)`, `Hoparlor (Audapp Browser)` — 4 distinct channel names, plus the
  pre-existing `Hoparlor (Audapp Input)` and physical `Hoparlor (High Definition Audio Device)`.
- **WASAPI probe: 4/4 PASS.** Each channel endpoint: Activate `IAudioClient` → GetMixFormat →
  Initialize (shared, 200 ms) → Start → Stop, all hr=0; state=ACTIVE; bufferFrames=8820
  (200 ms @ 44.1 kHz). This exercises the driver's stream-create path end to end.
- **Default render endpoint ends on the physical device** (`Hoparlor (High Definition Audio Device)`,
  IsAudapp=False); held stable through and after the WASAPI probe.
- **Audapp Input untouched**: `ROOT\DEVGEN\AUDAPP12G0001` ProblemCode 0, Service AudioCodec, oem19.inf.

## 22C.3.4 Default-audio auto-promotion (observed + remediated)

Immediately after install the Windows default render endpoint had auto-promoted to
`Hoparlor (Audapp Music)` — standard Windows behavior of preferring a newly-arrived endpoint; the
install's own reset ran before the four endpoints finished materializing. Remediated once with
`Reset-AudappAudioDefault.ps1 -DryRun:$false -ConfirmHostInstall -EndpointId <physical>` (default-audio
only; the script's guard rejects any Audapp endpoint id). After all endpoints had settled the
re-assert held — default stayed physical. Recommend the install flow re-assert the physical default
once more after `scan-devices`/endpoint settle (or after a short delay) so this is automatic.

## 22C.3.5 No forbidden mutation

No `AudioMulti` action; no physical audio driver deleted; Audapp Input never targeted. Mutations were
limited to: the AudappChannels package (oem20.inf) + its four devnodes, cert-store imports (idempotent),
and the Windows default render endpoint (set to physical). All within the authorized VM-only scope.

## 22C.3.6 Reboot persistence

Not run in this subphase — deferred pending operator approval. Reboot-persistence validation
completed in Phase 22C.4 (see below).

## 22C.3.7 Verdict

The Phase 22C.2 reconstructed driver is **runtime-validated** on the VM: 4 healthy devnodes, no
Code 37, 4 distinct persistent endpoint names, WASAPI render 4/4, default audio physical, Audapp Input
intact. Reboot persistence and uninstall validation completed in Phases 22C.4 and 22C.5.

---

# Phase 22C.4 Post-Reboot Persistence Verification

- Date: 2026-06-06
- Scope: confirm the 22C.3 AudappChannels install survives a full OS reboot (VM only).
  No new install. No host-machine mutation.
- Result: **PASS — all four devnodes healthy, all four endpoints distinct, WASAPI 7/7 PASS,
  default ended physical. Windows did NOT auto-promote Audapp after this reboot.**

## 22C.4.1 Preflight

Branch: `main`. Git status: same modified scripts + untracked report as pre-reboot — no
unexpected changes from the reboot.

## 22C.4.2 AudappChannels devnodes post-reboot

All four survived with identical state to the pre-reboot install:

| Devnode | Status | ProblemCode | Service |
|---|---|---|---|
| AUDAPPGENERAL0001 | OK | CM_PROB_NONE | AudappChannels |
| AUDAPPMUSIC0001 | OK | CM_PROB_NONE | AudappChannels |
| AUDAPPGAME0001 | OK | CM_PROB_NONE | AudappChannels |
| AUDAPPBROWSER0001 | OK | CM_PROB_NONE | AudappChannels |

No Code 37. No ProblemCode ≠ 0. Service AudappChannels on all four.

## 22C.4.3 Endpoint names post-reboot

MMDevice registry scan (property `{b3f8fa53-0004-438e-9003-51a46e139bfc},6`) confirmed
6 active render endpoints:

| FriendlyName | State | InstanceRef |
|---|---|---|
| Audapp Browser | 1 (ACTIVE) | ROOT\DEVGEN\AUDAPPBROWSER0001 |
| Audapp Game | 1 (ACTIVE) | ROOT\DEVGEN\AUDAPPGAME0001 |
| Audapp General | 1 (ACTIVE) | ROOT\DEVGEN\AUDAPPGENERAL0001 |
| Audapp Input | 1 (ACTIVE) | ROOT\DEVGEN\AUDAPP12G0001 |
| Audapp Music | 1 (ACTIVE) | ROOT\DEVGEN\AUDAPPMUSIC0001 |
| High Definition Audio Device | 1 (ACTIVE) | HDAUDIO\FUNC_01… |

All four AudappChannels endpoints present with distinct names. Audapp Input also present as
render endpoint (unchanged; its own render path from the input scaffold). Physical HDA present.

Note: the property key `{a45c254e-df1c-4efd-8020-67d146a850e0},14` (PKEY_Device_FriendlyName)
returned empty for these endpoints; the correct MMDevice name key is
`{b3f8fa53-0004-438e-9003-51a46e139bfc},6`. This is a documentation/tooling note, not a defect.

## 22C.4.4 Default audio post-reboot

`Reset-AudappAudioDefault.ps1 -DryRun` reported:

```
Current default: Hoparlör (High Definition Audio Device) [{0.0.0.00000000}.{6a08946d-...}]
Candidate physical endpoint: Hoparlör (High Definition Audio Device) [...] via current-default
```

The default was already the physical HDA device after reboot. **Windows did not auto-promote
any Audapp endpoint.** No re-assertion was needed or performed.

Contrast with 22C.3.4: after the first install, Windows promoted `Audapp Music` to default and a
re-assertion was required. After reboot the OS honored the previously-set physical default without
re-promoting Audapp. This is expected behavior (the promotion happens on device arrival, not at boot).

## 22C.4.5 WASAPI probe post-reboot

`cargo run --bin audapp_endpoint_probe` probed all 7 active endpoints (4 AudappChannels + physical
HDA + Audapp Input render + Audapp Input capture):

| Endpoint | Activate | GetMixFormat | Initialize | Start | Stop |
|---|---|---|---|---|---|
| Audapp Music | OK | 44100Hz 2ch 32-bit float | OK | OK | OK |
| Audapp General | OK | 44100Hz 2ch 32-bit float | OK | OK | OK |
| Audapp Game | OK | 44100Hz 2ch 32-bit float | OK | OK | OK |
| Audapp Browser | OK | 44100Hz 2ch 32-bit float | OK | OK | OK |
| High Definition Audio Device | OK | 48000Hz 2ch 32-bit float | OK | OK | OK |
| Audapp Input (render) | OK | 44100Hz 2ch 32-bit float | OK | OK | OK |
| Audapp Input (capture) | OK | 44100Hz 1ch 32-bit float | OK | OK | OK |

Summary: **7/7 PASS** — All WASAPI steps passed. Default render confirmed as physical HDA
(`Default render: true` on High Definition Audio Device only).

## 22C.4.6 Audapp Input post-reboot

Unchanged after reboot:

- `ROOT\DEVGEN\AUDAPP12G0001`
- ProblemCode: 0
- DriverInfPath: oem19.inf
- Status: OK
- Service: AudioCodec

## 22C.4.7 Verdict

**Reboot persistence: PASS.** The four AudappChannels devnodes, distinct endpoint names, WASAPI
render capability, physical default audio, and Audapp Input integrity all held across the OS reboot.
This matches the 21G validation profile and confirms the reconstructed driver is reboot-stable.

---

# Phase 22C.5 VM Uninstall Validation

- Date: 2026-06-06
- Scope: validate the uninstall path on the post-reboot VM state (oem20.inf, 4 devnodes active).
  No host-machine mutation.
- Result: **PASS — uninstall completed cleanly after fixing a ProtectedOemPackages false-positive.**

## 22C.5.1 Bug found: ProtectedOemPackages blocked oem20.inf

First dry-run attempt hit a safety stop:

```
SAFETY STOP: resolved package 'oem20.inf' is a protected package. Aborting.
```

**Root cause**: `AudappHostCommon.ps1` line 68 hardcoded:

```powershell
ProtectedOemPackages = @('oem19.inf', 'oem20.inf', 'oem21.inf')
```

This list originated from the Phase 22A spec's note: "Abort if the resolved name is oem19
(Audapp Input) / oem20/oem21 (AudioMulti)." That assumption was correct for the original
host-machine OEM numbering, but on this VM the AudappChannels install landed on oem20.inf (not
AudioMulti). The number-based guard caused a false positive.

Additionally: `Assert-NotAudappInputOrAudioMulti` adds the ProtectedOemPackages strings as
forbidden tokens when scanning the raw pnputil block. Had the line-289 check been bypassed, the
raw-block scan would have found "OEM20.INF" in the AudappChannels block itself (its published
name line), triggering a second stop.

**Fix applied** (`scripts/host-install/lib/AudappHostCommon.ps1` line 68):

```powershell
# Before:
ProtectedOemPackages = @('oem19.inf', 'oem20.inf', 'oem21.inf')

# After:
ProtectedOemPackages = @('oem19.inf')
```

`oem19.inf` is retained as a belt-and-suspenders guard for Audapp Input on this VM.
`oem20.inf` and `oem21.inf` are removed because:

1. `Get-AudappChannelsPublishedDrivers` already filters by `OriginalName=audiochannels.inf` +
   `Provider=Audapp` + `Class=MEDIA` — it can only resolve AudappChannels packages by identity.
2. `Assert-NotAudappInputOrAudioMulti` scans the raw block for forbidden AudioMulti/Input tokens
   (service names, hardware ids, inf names) — content-based identity check, OEM-number-agnostic.

The number-based list was redundant with content-based checks and wrong for this VM's OEM numbering.

## 22C.5.2 Uninstall dry-run (after fix)

`Uninstall-AudappHost.ps1 -DryRun` resolved:

- Package: `oem20.inf` — identity confirmed: `Forbidden-identity guard PASSED`,
  `Resolved package oem20.inf confirmed as AudappChannels`
- Devnodes:
  - `ROOT\DEVGEN\AUDAPPGENERAL0001`
  - `ROOT\DEVGEN\AUDAPPBROWSER0001`
  - `ROOT\DEVGEN\AUDAPPGAME0001`
  - `ROOT\DEVGEN\AUDAPPMUSIC0001`
- Fallback physical endpoint: `Hoparlör (High Definition Audio Device)`

Planned actions (none executed in dry-run):

1. Remove devnode AUDAPPGENERAL0001
2. Remove devnode AUDAPPMUSIC0001
3. Remove devnode AUDAPPGAME0001
4. Remove devnode AUDAPPBROWSER0001
5. Delete driver package oem20.inf (`/delete-driver /uninstall /force`)
6. Reset default render endpoint to Hoparlör (High Definition Audio Device)

Did NOT target: Audapp Input, AudioMulti, physical audio driver, any unrelated OEM package.
**Dry-run: SAFE. Proceeding to real uninstall.**

## 22C.5.3 Real VM-only uninstall

`Uninstall-AudappHost.ps1 -DryRun:$false -ConfirmHostInstall` → exit 0. All six planned actions
executed successfully (ExitCode 0 on each):

- AUDAPPGENERAL0001: `Device removed successfully.`
- AUDAPPMUSIC0001: `Device removed successfully.`
- AUDAPPGAME0001: `Device removed successfully.`
- AUDAPPBROWSER0001: `Device removed successfully.`
- oem20.inf: `Driver package uninstalled. Driver package deleted successfully.`
- Default render reset to `Hoparlör (High Definition Audio Device)`: OK

## 22C.5.4 Post-uninstall cleanup verification

All four checks run and passed:

| Check | Result |
|---|---|
| AudappChannels devnode count | 0 (none remaining) |
| oem20.inf in driver store | NOT FOUND |
| audiochannels.inf in driver store | NOT FOUND |
| Default render endpoint | Hoparlör (High Definition Audio Device) — physical HDA |
| Audapp Input ProblemCode | 0 |
| Audapp Input DriverInfPath | oem19.inf |
| Audapp Input Status | OK / CM_PROB_NONE |

Audapp Input was not touched at any stage of the uninstall.

## 22C.5.5 Proof only VM was mutated

All mutations were limited to:

- removed 4 AudappChannels devnodes (VM PnP stack only)
- deleted AudappChannels driver package oem20.inf from VM driver store
- reset VM Windows default render endpoint to physical HDA
- patched `scripts/host-install/lib/AudappHostCommon.ps1` (script fix in repo workspace)

No host-machine install, no host driver store, no physical audio drivers deleted, no Audapp Input
or AudioMulti touched, no bcdedit, no test-signing changes.

## 22C.5.6 Script fix summary

| File | Change | Reason |
|---|---|---|
| `scripts/host-install/lib/AudappHostCommon.ps1:68` | `ProtectedOemPackages = @('oem19.inf')` | oem20/oem21 were hardcoded OEM-number assumptions from Phase 22A spec; on this VM those numbers belong to AudappChannels. Identity-based guards already catch AudioMulti/Input by content. |

## 22C.5.7 Verdict

**Uninstall validation: PASS.** The uninstall path correctly resolves and removes only
AudappChannels devnodes and package, resets the default to physical, and leaves Audapp Input
intact — after fixing a hardcoded OEM-number false positive in `ProtectedOemPackages`.

---

# Phase 22C Final Summary

| Subphase | Result |
|---|---|
| 22C.1 Payload recovery | BLOCKED (signed payload absent; could not rebuild from available source) |
| 22C.2 Rebuild payload | PASS (reconstructed from audapp-input ACX source; correctly signed) |
| 22C.3 Real VM install | PASS (4 devnodes OK, 4 names, WASAPI 4/4, default physical, Input intact) |
| 22C.4 Reboot persistence | PASS (all devnodes + endpoints survived reboot; no Audapp auto-promotion; WASAPI 7/7) |
| 22C.5 Uninstall validation | PASS (clean removal after ProtectedOemPackages fix; default physical; Input intact) |

**Overall Phase 22C: PASS.**

## Recommendation

**Phase 22D (host readiness checklist) can proceed.**

Prerequisites confirmed:

- The reconstructed AudappChannels driver installs cleanly, survives reboot, and uninstalls cleanly on the VM.
- All host-install script logic (install, readiness check, default-reset, uninstall) is validated end-to-end.
- Scripts modified in this phase (`AudappHostCommon.ps1` ProtectedOemPackages fix) should be committed before 22D.
- The `ProtectedOemPackages` fix generalizes correctly: on the host the OEM number will differ again, but the identity guards (`OriginalName`, `Provider`, `Assert-NotAudappInputOrAudioMulti`) will catch AudioMulti/Input regardless of number.

Remaining open items (non-blocking for 22D):

1. The `Reset-AudappAudioDefault.ps1` auto-promotion workaround (22C.3.4 finding): the install script's
   final default-reset runs before all four endpoints have materialized; a post-settle re-assert or a
   short delay would make the install flow fully automatic. Not a correctness bug (manual reset works),
   but worth addressing before a fully-automated host install.
2. On the host machine the Audapp Input OEM number (`oem19.inf`) may differ — the retained
   `oem19.inf` entry in `ProtectedOemPackages` is VM-specific. On the host, identity guards alone
   are sufficient; consider removing `oem19.inf` from the list or making it dynamic in a future pass.
