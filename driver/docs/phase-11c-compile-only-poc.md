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
pwsh -File .\driver\scaffold\audapp-input\prepare.ps1 -SampleRoot C:\path\to\Windows-driver-samples
```

Compile:

```powershell
pwsh -File .\driver\scaffold\audapp-input\build.ps1 -SampleRoot C:\path\to\Windows-driver-samples
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
- `msbuild`, `cl`, and WDK build tooling are not available directly from the current shell
- `C:\Program Files (x86)\Windows Kits\10\build` is missing
- no local `Windows-driver-samples` checkout path was provided to import the ACX sample

Because of those blockers, this phase currently stops at a scaffold-ready state. No compile success is claimed.

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
- `build.ps1` reaches `msbuild` without environment errors
- the isolated sample-based scaffold compiles without adding app dependencies

No-Go conditions:

- no sample checkout is available
- WDK build tooling is still missing
- compile requires broad undocumented vendoring beyond the current reviewed path
- the work starts drifting into install, signing, or app integration scope
