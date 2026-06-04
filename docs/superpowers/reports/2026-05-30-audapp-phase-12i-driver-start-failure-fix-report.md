# Audapp Phase 12I Driver Start Failure Fix Report

Date: 2026-06-02
Project: `C:\Users\musta\Audapp`
Thread: Phase 12I Driver Start Failure Fix

## 1. Current device state

- Device instance: `ROOT\DEVGEN\AUDAPP12G0001`
- Friendly name: `Audapp Input`
- Class: `MEDIA`
- Class GUID: `{4d36e96c-e325-11ce-bfc1-08002be10318}`
- Service: `AudioCodec`
- Driver package: `oem9.inf`
- Current problem: `CM_PROB_FAILED_DRIVER_ENTRY`
- Problem code: `37 (0x25)`
- Problem status: `0xC000000D`
- Endpoint visibility: no Audapp endpoint in `Win32_SoundDevice`

## 2. Diagnosis evidence

### Install/bind state is good

- `devcon drivernodes "@ROOT\DEVGEN\AUDAPP12G0001"` shows selected candidate:
  - `C:\Windows\INF\oem9.inf`
  - section `Audio_Device`
- `pnputil /enum-devices /class Media` shows the device is bound to `oem9.inf`.
- `Get-PnpDevice` shows:
  - `Class = MEDIA`
  - `Service = AudioCodec`
  - `Status = Error`
  - `Problem = CM_PROB_FAILED_DRIVER_ENTRY`

### SetupAPI confirms configure succeeds and start fails

`C:\Windows\INF\setupapi.dev.log` shows:

- package import/staging succeeded
- driver selection succeeded for `ROOT\AudappInput`
- service `AudioCodec` was created successfully
- device configuration completed successfully
- failure occurs only at start:
  - `Install Device: Starting device 'ROOT\DEVGEN\AUDAPP12G0001'`
  - `Device not started: Device has problem: 0x25 (CM_PROB_FAILED_DRIVER_ENTRY), problem status: 0xc000000d`

### Event log evidence

System log evidence:

- `Microsoft-Windows-Kernel-PnP`, event `219`:
  - `The driver \Driver\AudioCodec failed to load for the device ROOT\DEVGEN\AUDAPP12G0001.`
- `Service Control Manager`, event `7045`:
  - service created for `Audapp Input`
  - image path points to `...\AudioCodec.sys`

### INF/package evidence

- `AudioCodec.inf` in the staged package and `C:\Windows\INF\oem9.inf` match structurally and previously matched by SHA256.
- INF content is package-correct for this phase:
  - `Class=MEDIA`
  - `ROOT\AudappInput`
  - `AddService = AudioCodec`
  - `KmdfLibraryVersion = 1.31`

### OS/runtime evidence

- VM OS: Windows 10 Home `10.0.19045`
- `C:\Windows\System32\drivers\acx01000.sys` exists
  - version `10.0.19041.3636`
- Official ACX version guidance says ACX `1.1` is supported on Windows 10 version 2004+ with minimum KMDF `1.31`, so a simple OS-version mismatch is not supported by current evidence:
  - https://learn.microsoft.com/en-us/windows-hardware/drivers/audio/acx-version-overview

### Binary evidence

`dumpbin` on `driver\scaffold\audapp-input\package\Debug\x64\AudioCodec.sys` shows:

- entry point: `FxDriverEntry`
- dependencies:
  - `WppRecorder.sys`
  - `ntoskrnl.exe`
  - `HAL.dll`
  - `WDFLDR.SYS`

No obvious missing static dependency was found from the image headers/imports.

### Source/codebase evidence

- The driver source under `driver\scaffold\audapp-input\project\upstream-audiocodec` and `driver\scaffold\audapp-input\Common` is still effectively the vendored upstream ACX sample.
- `git diff HEAD --` on the main driver source files showed no local source edits in:
  - `Driver.cpp`
  - `Device.cpp`
  - `RenderCircuit.cpp`
  - `CaptureCircuit.cpp`
  - `CircuitHelper.cpp`
- Current uncommitted scaffold changes are limited to build/support files, not the driver source itself.

## 3. Likely root cause

The failure has been narrowed to the early driver start path after successful bind/configure, not to package identity, signing, driver-store staging, or driver matching.

Current best evidence supports this statement:

- the Audapp package binds correctly
- the service and Media-class assignment are correct
- the driver then returns `STATUS_INVALID_PARAMETER (0xC000000D)` somewhere during driver start

The exact failing call is not yet proven from read-only evidence. The highest-probability window is one of these early ACX/WDF callbacks:

- `AcxDriverInitialize`
- `AcxDeviceInitInitialize`
- `AcxDeviceInitialize`
- `WdfDeviceAssignS0IdleSettings`
- `AcxDeviceAddCircuit`

No evidence collected in this phase proves that the Audapp-specific INF/name patch caused the start failure.

## 4. Files inspected

- `C:\Windows\INF\setupapi.dev.log`
- `C:\Windows\INF\oem9.inf`
- `driver\scaffold\audapp-input\project\upstream-audiocodec\AudioCodec.inf`
- `driver\scaffold\audapp-input\package\Debug\x64\AudioCodec.inf`
- `driver\scaffold\audapp-input\project\upstream-audiocodec\Driver.cpp`
- `driver\scaffold\audapp-input\project\upstream-audiocodec\Device.cpp`
- `driver\scaffold\audapp-input\project\upstream-audiocodec\DriverSettings.h`
- `driver\scaffold\audapp-input\Common\RenderCircuit.cpp`
- `driver\scaffold\audapp-input\Common\CaptureCircuit.cpp`
- `driver\scaffold\audapp-input\Common\CircuitHelper.cpp`
- `driver\scaffold\audapp-input\Common\StreamEngine.cpp`
- `driver\scaffold\audapp-input\Common\KeywordDetector.cpp`
- `driver\scaffold\audapp-input\shared\Trace.h`
- `driver\scaffold\audapp-input\AudioCodec.sys` package output via `dumpbin`

## 5. Changes made

- No driver source, INF, or build-script fix was applied in this phase.
- Added this report file to preserve the evidence trail.

## 6. Build/sign/reinstall commands run

Executed in this phase:

- read-only diagnostics only
- `dumpbin /imports`
- `dumpbin /headers`
- `dumpbin /dependents`

Not executed in this phase:

- rebuild
- catalog regeneration
- signing
- reinstall/update

Relevant prior elevated install evidence from the user-provided prompt:

- `pnputil /add-driver "...\\AudioCodec.inf" /install`
- `pnputil /scan-devices`

Those commands successfully moved the device from unbound to bound, but not to started.

## 7. Verification result

- Binding to `oem9.inf` is confirmed.
- `AudioCodec` service assignment is confirmed.
- Media class assignment is confirmed.
- Code 37 remains present.
- No MMDevice/audio endpoint appears.

## 8. Whether the driver starts

No. The driver remains in `CM_PROB_FAILED_DRIVER_ENTRY`.

## 9. Whether an endpoint appears

No. No Audapp endpoint appeared in `Win32_SoundDevice`.

## 10. Limitations

- The current Codex shell is not elevated, so admin-only reinstall/rescan and some log access are blocked here.
- No kernel debugger, WDFKD, or ACXKD session was available in this phase.
- IFR/WPP traces were not available from this shell in a way that identified the exact failing callback.

## 11. Exact next step

Do not apply a speculative source fix yet.

Next action:

1. Use an elevated Administrator PowerShell session in the VM.
2. Attach WinDbg/kernel debugging for the VM.
3. Set breakpoints at:
   - `AudioCodec!DriverEntry`
   - `AudioCodec!Codec_EvtBusDeviceAdd`
   - `AudioCodec!Codec_EvtDevicePrepareHardware`
   - `AudioCodec!Codec_SetPowerPolicy`
4. Reproduce the start by updating the existing `ROOT\DEVGEN\AUDAPP12G0001` device.
5. Capture the first exact failing NTSTATUS return and only then implement the smallest source fix.

If WinDbg is not available, the fallback next step is enabling WDF/ACX diagnostics for `AudioCodec.sys` and collecting IFR/verifier evidence, because the current evidence is not strong enough to justify a driver-source change.
