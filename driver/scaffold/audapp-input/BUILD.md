# Build notes

## Goal

Run a compile-only build of the isolated driver scaffold. No install or load is permitted here.

## Prerequisites

- Visual Studio with C++ build support
- matching Windows SDK and WDK
- WDK build tooling discoverable from Visual Studio developer environment
- a local checkout of Microsoft's `Windows-driver-samples`
- the ACX sample path `audio/Acx/Samples/AudioCodec/Driver`

## Commands

Prepare the scaffold from a local upstream checkout:

```powershell
powershell -ExecutionPolicy Bypass -File .\prepare.ps1 -SampleRoot C:\path\to\Windows-driver-samples
```

Attempt compile-only:

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1 -SampleRoot C:\path\to\Windows-driver-samples
```

If preparation already ran and imported the upstream files:

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

## Expected outputs

- solution and project files under `project\upstream-audiocodec\`
- if build succeeds, WDK outputs such as `.sys`, `.inf`, `.cat`, and standard intermediate directories

## Current toolchain expectation

- use Visual Studio 2026 Developer Command Prompt
- use WDK build version `10.0.28000.0`
- use WDK task DLL version `18.0`
- pass `VisualStudioVersion=18.0`
- pass `WindowsTargetPlatformVersion=10.0.28000.0`
- force compile-only behavior with:
  - `SignMode=Off`
  - `DriverPackage=False`
  - `SupportsPackaging=false`

## Current result

- `prepare.ps1` succeeds with the official sample checkout
- `build.ps1` now compiles the isolated scaffold successfully
- output path:
  - `driver/scaffold/audapp-input/project/upstream-audiocodec/x64/Debug/AudioCodec.sys`
- build log:
  - `driver/scaffold/audapp-input/project/build/AudioCodec-Debug-x64.binlog`

## Troubleshooting

- `SampleRoot does not exist`: point `-SampleRoot` to a real `Windows-driver-samples` checkout
- `pwsh` was not found: use Windows PowerShell as shown above or install PowerShell 7 separately
- `msbuild was not found after entering the developer shell`: repair Visual Studio or open the correct developer shell
- `ValidateNTTargetVersion` tried to load `Microsoft.DriverKit.Build.Tasks.17.0.dll`: force the scaffold to use VS18 and derive the WDK task version from the installed WDK `bin` directory
- build failed on `cpp_utils.h`: import the required `Inc/` and `Shared/` sample headers so `Common\SamplesCommon.vcxproj` can compile

## Hard warning

```text
Do not install, load, sign, or test-sign any driver as part of this build flow.
```
