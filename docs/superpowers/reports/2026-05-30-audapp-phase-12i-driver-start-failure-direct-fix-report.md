# Audapp Phase 12I Driver Start Failure Direct Fix Report

Date: 2026-06-02
Project: `C:\Users\musta\Audapp`

## 1. Starting state

- Existing bound device: `ROOT\DEVGEN\AUDAPP12G0001`
- Driver package: `oem9.inf`
- Service: `AudioCodec`
- Class: `MEDIA`
- Current failure before this turn: `Code 37 / CM_PROB_FAILED_DRIVER_ENTRY / 0xC000000D`

## 2. Evidence collected

- Existing machine evidence still points to a start-time failure after successful bind/configure.
- `Microsoft-Windows-Kernel-PnP/Configuration` event `400` shows the device was configured.
- `Microsoft-Windows-Kernel-PnP/Configuration` event `411` shows the same device immediately failed to start with:
  - `Problem: 0x25`
  - `Problem Status: 0xC000000D`
- `System` log event `219` still reports:
  - `The driver \Driver\AudioCodec failed to load for the device ROOT\DEVGEN\AUDAPP12G0001.`

## 3. Root cause status

The exact failing ACX/WDF call is still not proven from preexisting logs alone.

This turn therefore followed the systematic-debugging rule of gathering tighter evidence before guessing at a fix.

## 4. Files changed

- `driver\scaffold\audapp-input\shared\Public.h`
- `driver\scaffold\audapp-input\project\upstream-audiocodec\Driver.cpp`
- `driver\scaffold\audapp-input\project\upstream-audiocodec\Device.cpp`
- `driver\scaffold\audapp-input\Common\RenderCircuit.cpp`
- `driver\scaffold\audapp-input\Common\CaptureCircuit.cpp`

## 5. What changed

Added targeted `KdPrintEx`-backed trace points for the early start path, including:

- `DriverEntry`
- `Codec_EvtBusDeviceAdd`
- `Codec_EvtDevicePrepareHardware`
- `Codec_SetPowerPolicy`
- `CodecR_CreateRenderCircuit`
- `CodecC_CreateCaptureCircuit`

The instrumentation now logs named failure points for:

- `WdfDriverCreate`
- `AcxDriverInitialize`
- `AcxDeviceInitInitialize`
- `WdfDeviceCreate`
- `AcxDeviceInitialize`
- `WdfDeviceAssignS0IdleSettings`
- `AcxDeviceAddCircuit`
- circuit creation
- element creation
- pin creation
- jack creation
- supported-format registration
- circuit pin registration

## 6. Build / catalog / signing results

- Build: passed
  - `powershell -ExecutionPolicy Bypass -File .\driver\scaffold\audapp-input\build.ps1`
- Catalog generation: passed
  - `powershell -ExecutionPolicy Bypass -File .\driver\scaffold\audapp-input\Generate-Catalog.ps1`
- Signing: not completed in this shell
  - `powershell -ExecutionPolicy Bypass -File .\driver\scaffold\audapp-input\Sign-Catalog.ps1 -SignSys`
  - failed because this PowerShell session is not elevated and the script requires LocalMachine certificate store access

## 7. Reinstall/update actions

- No reinstall/update was performed in this turn.
- No cleanup was performed.
- No extra root device was created.

## 8. Final device state in this turn

Unchanged from the previously confirmed VM state:

- bound to `oem9.inf`
- service `AudioCodec`
- class `MEDIA`
- still failing with `Code 37 / 0xC000000D`

## 9. Whether Code 37 is gone

No.

## 10. Whether endpoint appears

No.

## 11. Limitation

This Codex shell is not elevated, so the rebuilt package could be compiled and cataloged here but not re-signed through the current script and not safely reinstalled onto the VM device from this session.

## 12. Exact next step

From an elevated Administrator PowerShell session in the VM:

1. Run:
   `powershell -ExecutionPolicy Bypass -File C:\Users\musta\Audapp\driver\scaffold\audapp-input\Sign-Catalog.ps1 -SignSys`
2. Reinstall/update the rebuilt package on the existing device:
   `pnputil /add-driver "C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64\AudioCodec.inf" /install`
3. Run:
   `pnputil /scan-devices`
4. Capture debugger output or live kernel trace output for the new named log points.

The next reproduction should identify the exact failing callback/DDI instead of leaving the failure at a generic `0xC000000D`.
