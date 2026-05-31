# Phase 11C - Compile-Only `Audapp Input` POC

## Objective

Create the smallest safe path toward a future Audapp-owned virtual render endpoint named `Audapp Input` without changing the working Audapp application and without installing any driver.

## Scope

Included:

- isolated scaffold work under `driver/scaffold/audapp-input/`
- compile-only preparation and build scripts
- official sample provenance and adaptation notes
- exact blocker reporting when prerequisites are missing

Excluded:

- driver installation or loading
- test-signing
- app-side transport
- app-side routing integration
- Cargo/Tauri build integration

## Endpoint target

```text
Audapp Input
```

Type:

```text
single virtual render endpoint
```

## Safety constraints

- No install
- No load
- No `bcdedit`
- No `pnputil`
- No `devcon`
- No admin-only runtime action
- No edits outside `driver/`

## Chosen framework path

- Implementation target: ACX
- Structural reference: SYSVAD virtual-audio pattern
- ACX sample basis: `audio/Acx/Samples/AudioCodec/Driver` from Microsoft's `Windows-driver-samples`
- SYSVAD reference files for topology review: `audio/sysvad/sysvad.sln`, `audio/sysvad/adapter.cpp`, `audio/sysvad/common.cpp`, `audio/sysvad/common.h`, `audio/sysvad/EndpointsCommon/`, `audio/sysvad/Package/`

## Project layout

```text
driver/
  docs/
    phase-11c-compile-only-poc.md
    phase-11d-transport-preview.md
  scaffold/
    audapp-input/
      README.md
      BUILD.md
      SAFETY.md
      PROVENANCE.md
      .gitignore
      prepare.ps1
      build.ps1
      project/
        README.md
        import-manifest.json
```

## Compile-only command

Preparation:

```powershell
powershell -ExecutionPolicy Bypass -File .\driver\scaffold\audapp-input\prepare.ps1 -SampleRoot C:\path\to\Windows-driver-samples
```

Compile:

```powershell
powershell -ExecutionPolicy Bypass -File .\driver\scaffold\audapp-input\build.ps1 -SampleRoot C:\path\to\Windows-driver-samples
```

The build script never installs or loads a driver. It only:

1. validates Visual Studio and WDK prerequisites
2. optionally imports the approved sample files
3. invokes `msbuild` against the isolated solution if the environment is complete

## Expected outputs

If the environment is complete and the upstream sample adapts cleanly, expected outputs are limited to build artifacts such as:

- `.sys`
- `.inf`
- `.cat`
- intermediate `x64\Debug` or `x64\Release` directories under the scaffold project

If the environment is incomplete, expected output is a clear blocker message and no install side effects.

## Current execution result

Environment facts observed in this session:

- Visual Studio Community 2026 is installed at `C:\Program Files\Microsoft Visual Studio\18\Community`
- Visual Studio 2022 Build Tools are also installed at `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`
- current WDK documentation does not validate Visual Studio 2026 for driver development, so the scaffold now prefers Visual Studio 2022 when available
- `msbuild` and `cl` are not available directly from the current PowerShell session
- a Visual Studio developer command environment is available through `VsDevCmd.bat` / `LaunchDevCmd.bat`
- `pwsh` is not installed, so commands in this repo must run through Windows PowerShell
- Windows SDK include/lib roots exist, but `C:\Program Files (x86)\Windows Kits\10\build` is missing
- kernel-mode WDK headers such as `C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\km` are missing
- local official sample checkout now exists at `C:\Users\mustafa\source\repos\Windows-driver-samples`
- expected ACX sample path exists at `C:\Users\mustafa\source\repos\Windows-driver-samples\audio\Acx\Samples\AudioCodec\Driver`
- an official `winget` install attempt for `Microsoft.WindowsWDK.10.0.26100` downloaded the installer but failed before completing WDK setup with installer exit `2147944002`

`prepare.ps1` can run in the current environment. `build.ps1` remains blocked at WDK detection because the WDK build tree and kernel headers are not installed.

## What success means

- the scaffold exists under `driver/scaffold/audapp-input/`
- the target endpoint name is frozen as `Audapp Input`
- the ACX-first, SYSVAD-reference path is documented
- compile-only commands are explicit and isolated
- missing prerequisites are reported exactly when compile cannot start

## What success does not mean

- it does not mean a driver has been installed
- it does not mean `Audapp Input` appears in Windows today
- it does not mean driver-to-app transport exists
- it does not mean Audapp can route audio without Voicemeeter today
- it does not mean production virtual device support is ready

## Go / No-Go for Phase 11D

Current recommendation:

```text
No-Go for Phase 11D implementation until Phase 11C reaches a real compile result.
```

Go conditions:

- a local official `Windows-driver-samples` checkout is available
- WDK build tools are installed and discoverable
- kernel-mode WDK headers are installed
- `build.ps1` reaches `msbuild` without environment errors
- the isolated sample-based scaffold compiles without adding app dependencies

No-Go conditions:

- WDK build tooling is still missing
- the current session cannot complete WDK installation
- compile requires broad undocumented vendoring beyond the current reviewed path
- the work starts drifting into install, signing, or app integration scope
