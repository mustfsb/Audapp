# Audapp — Phase 12I.3: Code 37 Driver Start Failure — Opus Fix Report

Date: 2026-06-02
Branch: `codex/phase-12h-driver-binding-fix-docs`
Agent: Claude Opus 4.8 (taking over from Codex)
Method: Systematic debugging (root cause before fix). **No blind bisecting repeated.**

---

## TL;DR

**Root cause: ACX class-extension version mismatch.** The driver was built requesting
**ACX 1.1**, but this machine (Windows 10 19045) ships only **ACX 1.0**
(`Acx01000.sys` = `10.0.19041.3636`). The ACX class bind (`WdfVersionBindClass`)
fails at driver load → `STATUS_FAILED_DRIVER_ENTRY (0xC0000365)` with inner
`STATUS_INVALID_PARAMETER (0xC000000D)` → **Code 37 / CM_PROB_FAILED_DRIVER_ENTRY**.

This is why Codex's bisects never worked: **the version bind is wired by the linked
`acxstub.lib` and happens at driver load — before/independent of any source code body
Codex bypassed.** No source bypass could ever touch it.

**Fix (small, source-level):** rebuild against **ACX 1.0** (match the OS), and restore
the source from Codex's broken bisect=10 state to `NONE`. Build succeeded with 0 errors.
Catalog generated. **Signing + install require elevation** (this session is non-admin) and
are pending the user running them.

---

## 1. Starting state

- OS: **Windows 10 Home, build 19045 (22H2), UBR 3803**.
- In-box KMDF: `Wdf01000.sys` **1.31** (matches INF `KmdfLibraryVersion = 1.31`).
- ACX runtime present: `C:\Windows\System32\drivers\Acx01000.sys`,
  **version 10.0.19041.3636**, service `Acx01000` (demand-start, Stopped). This is the
  Win10 19041-servicing-branch ACX, which provides **ACX 1.0 only**.
- Active device: `ROOT\DEVGEN\AUDAPP12G0001`, class MEDIA, service `AudioCodec`,
  bound to **`oem18.inf`** (not oem10 — package pollution: each test added an oem*.inf),
  Status `Error`, ProblemCode **37**, ProblemStatus **3221225485 = 0xC000000D**.
- Kernel-PnP Event 219 (repeated on every attempt): "The driver \Driver\AudioCodec
  failed to load for the device ROOT\DEVGEN\AUDAPP12G0001", **Status = 0xC0000365
  (STATUS_FAILED_DRIVER_ENTRY)**.

## 2. Source diff state inherited from Codex

- `project/upstream-audiocodec/` (Driver.cpp, Device.cpp, AudioCodec.inf, vcxproj) is
  **untracked** in git — so `git diff` on Driver.cpp/Device.cpp showed nothing.
- `shared/Public.h` (tracked): Codex added trace macros (`AUDAPP_TRACE_*`) plus a 11-stage
  bisect ladder, with the switch left at the **most aggressive** value:
  `AUDAPP_DIAG_STARTUP_BISECT = AUDAPP_DIAG_BISECT_SKIP_ACX_DRIVER_AND_DEVICE_INITIALIZE` (10).
  In that state `DriverEntry` skips `AcxDriverInitialize` yet `Codec_EvtBusDeviceAdd`
  still calls `AcxDeviceInitInitialize` — itself a guaranteed `STATUS_INVALID_PARAMETER`,
  so the installed `oem18` binary was independently broken and could never validly test
  the baseline.
- `Common/RenderCircuit.cpp`, `Common/CaptureCircuit.cpp` (tracked): Codex edits are
  **pure instrumentation** (expand `RETURN_NTSTATUS_IF_FAILED` into explicit checks +
  `AUDAPP_TRACE_STATUS`). No behavioral change. **Kept** (useful, harmless).

## 3. Were diagnostic bypasses reverted?

**Yes.** `AUDAPP_DIAG_STARTUP_BISECT` reset to `AUDAPP_DIAG_BISECT_NONE` so all real
ACX startup (DriverInitialize, DeviceInitialize, circuits, prepare-hardware) runs.
Trace macros and instrumentation retained.

## 4. Root cause

ACX is consumed as a **WDF class extension** (binary imports only `WDFLDR.SYS` /
`ntoskrnl.exe` / `WppRecorder.sys`; `WdfVersionBindClass` present; no static `acx.sys`
import). The class version requested at bind time is baked into the linked
`acxstub.lib`:

- `AudioCodec.vcxproj` and `Common/SamplesCommon.vcxproj` set `ACX_VERSION_MINOR=1`,
  include `acx\km\1.1`, and link `acx\km\1.1\acxstub.lib` → **requests ACX class 1.1**.
- OS provides `Acx01000.sys` **1.0** (19041 branch). 1.1 needs a newer branch (22621+).
- `WdfVersionBindClass(ACX 1.1)` cannot be satisfied by a 1.0 provider →
  `STATUS_INVALID_PARAMETER (0xC000000D)` during load → `FAILED_DRIVER_ENTRY (0xC0000365)`
  → Code 37.

Confirmed from four independent angles: vcxproj version setting; installed
`Acx01000.sys` version; Event 219 load status; and the fact that the failure is
pre-code (explaining every failed Codex bisect). KMDF version, INF tokens
(`$KMDFVERSION$`→1.31, `$ARCH$`→amd64), signing, root devnode, and binding were all
verified **correct** and ruled out.

## 5. Files changed

- `driver/scaffold/audapp-input/project/upstream-audiocodec/AudioCodec.vcxproj`
  — `ACX_VERSION_MINOR` 1→0 (Globals + 4× `PreprocessorDefinitions`). Include/lib paths
  are macro-driven so they followed automatically (`acx\km\1.0`).
- `driver/scaffold/audapp-input/Common/SamplesCommon.vcxproj`
  — hardcoded include `acx\km\1.1`→`1.0` (4×) and `ACX_VERSION_MINOR` 1→0 (4×).
- `driver/scaffold/audapp-input/shared/Public.h`
  — `AUDAPP_DIAG_STARTUP_BISECT` → `AUDAPP_DIAG_BISECT_NONE`.

## 6. Build result

**SUCCESS — 0 warnings, 0 errors.** Compiler used `acx\km\1.0` + `/D ACX_VERSION_MINOR=0`;
linker pulled `acx\km\1.0\acxstub.lib`. Staged: `package\Debug\x64\AudioCodec.sys`
(DriverVer stamped `06/02/2026,5.5.16.91`, KMDF 1.31). The sample compiles cleanly under
ACX 1.0 (uses only 1.0 core DDIs).

## 7. Catalog result

**SUCCESS.** `Generate-Catalog.ps1` produced `package\Debug\x64\AudioCodec.cat`
(OsTarget `10_VB_X64`); signability test passed (0 errors / 0 warnings).

## 8. Signing result

**BLOCKED — requires elevation.** `Sign-Catalog.ps1` aborts in a non-admin session
(LocalMachine cert store + `signtool /sm`). The signing cert
`CN=Audapp VM Test Code Signing` already exists, so the user running it elevated will
succeed. **Pending.**

## 9. Install / update result

**Not performed** — `pnputil /add-driver /install` needs elevation. **Pending.**

## 10. Final device state

Unchanged so far (still `oem18` / Code 37 / 0xC000000D) because the rebuilt, ACX-1.0
binary has not yet been signed and installed. Verification pending the elevated steps.

## 11. Is Code 37 gone?

**Not yet confirmed** — requires the elevated sign + install, then re-check. The fix
directly removes the failure mechanism (version bind now matches the OS), so this is
expected to clear or change.

## 12. Does the endpoint appear?

Not yet (secondary; only meaningful once Code 37 clears).

## 13. Cleanup performed

**None.** No device removed, no devgen, no oem deletions, no other drivers touched. The
rebuild uses the existing devnode/binding (the allowed "update existing device" path).

## 14. Exact next step

In an **elevated** PowerShell (Run as Administrator):

```powershell
cd C:\Users\musta\Audapp
powershell -ExecutionPolicy Bypass -File .\driver\scaffold\audapp-input\Sign-Catalog.ps1 -SignSys
pnputil /add-driver "C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64\AudioCodec.inf" /install
pnputil /scan-devices
```

Then verify:

```powershell
Get-PnpDevice -InstanceId 'ROOT\DEVGEN\AUDAPP12G0001' | Format-List FriendlyName,Status,Class
Get-PnpDeviceProperty -InstanceId 'ROOT\DEVGEN\AUDAPP12G0001' -KeyName DEVPKEY_Device_ProblemCode,DEVPKEY_Device_ProblemStatus,DEVPKEY_Device_DriverInfPath
```

Success = ProblemCode no longer 37 (ideally device Started/OK on the new oem*.inf).
If it succeeds but no audio endpoint, that's a separate follow-up (endpoint exposure),
not a driver-start failure.

If the device stays on `oem18.inf` after install (stale higher-versioned package wins),
re-point it to the newly added package and re-scan (targeted, device-only — documented
before running).
