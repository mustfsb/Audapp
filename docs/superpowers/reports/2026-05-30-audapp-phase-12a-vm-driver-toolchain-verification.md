# Audapp Phase 12A VM Driver Toolchain Verification

Date: 2026-06-01
Workspace: `C:\Users\musta\Audapp`

## 1. VM/toolchain summary

- VM has Git, Node.js, npm, Rust, and Visual Studio Community 2026 installed.
- Audapp app-side baseline builds pass.
- Driver scaffold exists in the repo and is ACX-based.
- Compile-only driver build does not currently work because WDK build tools are missing.
- Tool installation could not be completed in-session because the available shell is not elevated for Visual Studio Installer / SDK / WDK modification flows.

## 2. Git/repo state

- Current branch: `main`
- Remote: `origin https://github.com/mustfsb/Audapp.git`
- Working tree at initial inspection: clean
- Working tree after Phase 12A artifact generation: dirty only from the new report/prompt files under `docs/superpowers/`
- `driver/` folder: present
- Old branch `codex/phase-11c-compile-only-poc`: not present
- Old commit `b1b50442c8ae160ce515344f0718cd7fc34db579`: not present in this clone
- Relevant driver history already exists on `main`:
  - `bd32836` `docs(driver): add phase 11c compile-only scaffold`
  - `2cf7eda` `build(driver): compile Audapp Input scaffold`

## 3. Installed versions and command verification

### Core tools

- `git --version` -> `git version 2.54.0.windows.1`
- `node --version` -> `v24.16.0`
- `npm.cmd --version` -> `11.13.0`
- `rustc --version` -> `rustc 1.96.0 (ac68faa20 2026-05-25)`
- `cargo --version` -> `cargo 1.96.0 (30a34c682 2026-05-25)`
- `rustup --version` -> `rustup 1.29.0 (28d1352db 2026-03-05)`

### Rust target status

- Default host: `x86_64-pc-windows-msvc`
- Active toolchain: `stable-x86_64-pc-windows-msvc`
- Installed target(s):
  - `x86_64-pc-windows-msvc`

### PATH / tool discovery

- `where cl` -> not on PATH
- `where msbuild` -> not on PATH
- `where devenv` -> not on PATH
- `where signtool` -> not on PATH
- `where inf2cat` -> not found
- `where stampinf` -> not found
- `where tracewpp` -> not on PATH
- `where windbg` -> not found
- `winget` -> not installed / not on PATH

### Resolved tool locations

- `cl.exe`
  - `C:\Program Files\Microsoft Visual Studio\18\Community\VC\Tools\MSVC\14.51.36231\bin\Hostx64\x64\cl.exe`
- `MSBuild.exe`
  - `C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\amd64\MSBuild.exe`
- `devenv.exe`
  - `C:\Program Files\Microsoft Visual Studio\18\Community\Common7\IDE\devenv.exe`
- `signtool.exe`
  - `C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe`
- `tracewpp.exe`
  - `C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\tracewpp.exe`

## 4. Visual Studio / SDK / WDK status

### Visual Studio

- `vswhere` reports:
  - Product: `Visual Studio Community 2026`
  - Version: `18.6.2`
  - Install path: `C:\Program Files\Microsoft Visual Studio\18\Community`
- Native desktop workload appears present:
  - `vswhere -requires Microsoft.VisualStudio.Workload.NativeDesktop` returned the VS 2026 instance
- CMake component appears present:
  - `vswhere -requires Microsoft.VisualStudio.Component.VC.CMake.Project` returned the VS 2026 instance

### SDK

- Installed Windows SDK package family detected in registry:
  - `Windows SDK 10.1.26100.8249`
- `KitsRoot10` is present:
  - `C:\Program Files (x86)\Windows Kits\10\`
- SDK signing tools are present, but full driver build layout is not.

### WDK

- No installed WDK package found in uninstall registry entries.
- `C:\Program Files (x86)\Windows Kits\10\build` does not exist.
- `inf2cat.exe` and `stampinf.exe` were not found.
- This is the direct blocker for the compile-only build.

### Spectre-mitigated libs

- `vswhere -requires Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre` returned no matching instance.
- Spectre support should be treated as missing until added through Visual Studio Installer.

### WinDbg

- `where windbg` returned not found.
- No separate WinDbg install was detected in registry inspection.

## 5. Missing components found and install attempts

### Missing or incomplete items

- WDK
- WDK build tools under `Windows Kits\10\build`
- Spectre-mitigated MSVC runtime libraries
- WinDbg
- Latest driver-target SDK/WDK pairing expected by current scaffold docs (`28000` series)
- `winget` command-line availability

### Install attempts made

- Pulled official Microsoft driver-dev VS config:
  - `https://raw.githubusercontent.com/microsoft/Windows-driver-samples/main/_wdk_utils/winget/configs/wdk-desktop.vsconfig`
- Attempted Visual Studio Installer modification against the existing VS 2026 instance using that config.
- Result: failed with installer exit code `5007`
- Installer log reason:
  - commands with `--passive` should be run elevated from the beginning
- No SDK/WDK installation was completed in this session because the shell context is not elevated and `winget` is unavailable.

## 6. Audapp app build baseline result

### `npm install`

- Passed
- Result: dependencies already up to date, `0` vulnerabilities

### `npm run build`

- Passed
- Vite production build completed successfully

### `cargo check --manifest-path src-tauri\Cargo.toml`

- Passed
- Build completed with warnings only
- Main result: `Finished dev profile [unoptimized + debuginfo] target(s)`
- Notable issue class: unused imports / dead code warnings in Rust modules

## 7. Driver scaffold detection result

### Current scaffold status

- Driver scaffold exists in the current repo.
- Framework direction: ACX-based.
- Evidence:
  - `driver/scaffold/audapp-input/prepare.ps1`
  - `driver/scaffold/audapp-input/build.ps1`
  - vendored `Common/`, `inc/`, and `shared/` sources
  - `driver/scaffold/audapp-input/Common/SamplesCommon.vcxproj`
- Before preparation, the repo did not contain the imported upstream `AudioCodec.sln` / `AudioCodec.vcxproj` snapshot.
- The scaffold intentionally expects a local checkout of `microsoft/Windows-driver-samples` and imports `audio/Acx/Samples/AudioCodec/Driver` on demand.

### Upstream sample checkout used

- Cloned successfully:
  - `C:\Users\musta\toolchains\Windows-driver-samples`

### Preparation status

- `prepare.ps1` succeeded indirectly via `build.ps1 -SampleRoot ...`
- Imported upstream sample snapshot now exists under:
  - `driver/scaffold/audapp-input/project/upstream-audiocodec/`

## 8. Compile-only driver build attempt result

### Command attempted

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\musta\Audapp\driver\scaffold\audapp-input\build.ps1 -SampleRoot C:\Users\musta\toolchains\Windows-driver-samples
```

### Result

- Compile-only build attempted: yes
- Compile-only build passed: no

### First meaningful error

```text
Windows Kits build tools were not found at C:\Program Files (x86)\Windows Kits\10\build
```

### Interpretation

- Failure is environmental, not yet a source-code compile failure.
- The build cannot reach `msbuild` driver tasks because WDK is not installed.
- No driver install/load/test-signing was attempted.

## 9. Blockers

1. WDK is missing.
2. The current shell/session is not elevated enough to silently modify Visual Studio or install SDK/WDK components.
3. `winget` is unavailable, removing the easiest automated install path documented by Microsoft.
4. WinDbg is not installed.
5. Spectre libraries appear missing.

## 10. Exact next step

Use an elevated Windows session to install the Microsoft driver-development toolchain for the existing VS 2026 instance:

1. Install or modify Visual Studio 2026 with the official WDK desktop component set, including Spectre libraries.
2. Install the current Windows SDK / WDK driver pair expected by Microsoft’s current docs.
3. Re-run:
   - `powershell -ExecutionPolicy Bypass -File driver\scaffold\audapp-input\build.ps1 -SampleRoot C:\Users\musta\toolchains\Windows-driver-samples`
4. Only after WDK is present should Phase 12B continue into real compile-error triage, if any remain.

## References

- WDK install with Visual Studio / WinGet config:
  - <https://learn.microsoft.com/en-us/windows-hardware/drivers/install-the-wdk-using-winget>
- WDK downloads:
  - <https://learn.microsoft.com/en-us/windows-hardware/drivers/download-the-wdk>
- Windows SDK downloads:
  - <https://learn.microsoft.com/en-us/windows/apps/windows-sdk/downloads>
