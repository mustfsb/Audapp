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

Generate a driver catalog for the staged package (after a successful build; no signing):

```powershell
powershell -ExecutionPolicy Bypass -File .\Generate-Catalog.ps1
```

Sign the catalog on a VM snapshot (elevated PowerShell; no install/load):

```powershell
powershell -ExecutionPolicy Bypass -File .\Sign-Catalog.ps1
```

Optional: also sign the staged `.sys` for extra verification:

```powershell
powershell -ExecutionPolicy Bypass -File .\Sign-Catalog.ps1 -SignSys
```

## Expected outputs

- solution and project files under `project\upstream-audiocodec\`
- if build succeeds, WDK outputs such as `.sys`, `.inf`, and standard intermediate directories under `project\upstream-audiocodec\<platform>\<configuration>\`
- staged package (INF + SYS) under `package\<configuration>\<platform>\` (default: `package\Debug\x64\`)
- package-facing INF strings are patched to **Audapp Input** by `Apply-PackageIdentity.ps1` before each build

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

- `prepare.ps1` succeeds with the official sample checkout and applies Audapp Input package identity to the INF
- `build.ps1` compiles the isolated scaffold and stages INF + SYS into `package\Debug\x64\`
- raw build output:
  - `driver/scaffold/audapp-input/project/upstream-audiocodec/x64/Debug/AudioCodec.sys`
- staged package:
  - `driver/scaffold/audapp-input/package/Debug/x64/AudioCodec.sys`
  - `driver/scaffold/audapp-input/package/Debug/x64/AudioCodec.inf`
  - `driver/scaffold/audapp-input/package/Debug/x64/audiocodec.cat` (after `Generate-Catalog.ps1`; INF references `AudioCodec.cat`)
  - signed catalog/binary after elevated `Sign-Catalog.ps1` on a VM snapshot
- build log:
  - `driver/scaffold/audapp-input/project/build/AudioCodec-Debug-x64.binlog`

## Troubleshooting

- `SampleRoot does not exist`: point `-SampleRoot` to a real `Windows-driver-samples` checkout
- `pwsh` was not found: use Windows PowerShell as shown above or install PowerShell 7 separately
- `msbuild was not found after entering the developer shell`: repair Visual Studio or open the correct developer shell
- `ValidateNTTargetVersion` tried to load `Microsoft.DriverKit.Build.Tasks.17.0.dll`: force the scaffold to use VS18 and derive the WDK task version from the installed WDK `bin` directory
- build failed on `cpp_utils.h`: import the required `Inc/` and `Shared/` sample headers so `Common\SamplesCommon.vcxproj` can compile
- `Inf2Cat` error `22.9.7` (DriverVer in the future): `Generate-Catalog.ps1` passes `/uselocaltime`; rebuild if the staged INF date is stale

## Hard warning

```text
build.ps1 and Generate-Catalog.ps1 do not install, load, or enable test signing.
Sign-Catalog.ps1 signs package artifacts only; it does not install or load the driver.
Driver install and pnputil belong in a later VM phase (see Phase 12F prompt).
```
