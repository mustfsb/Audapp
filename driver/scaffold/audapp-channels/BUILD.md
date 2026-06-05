# Build notes — Audapp Channels (Phase 21F)

## Goal

Run a **compile-only** build of the isolated separate-root driver scaffold. No
install, load, devgen, pnputil, or test-signing is permitted here.

## Prerequisites

- Visual Studio 2026 (VS18) with C++ kernel-mode driver support
- Windows SDK + WDK build version `10.0.28000.0`
- ACX 1.0 headers (the project pins `ACX_VERSION_MAJOR=1; ACX_VERSION_MINOR=0`)
- The Microsoft-derived ACX `AudioCodec` source present on-disk under
  `Common/`, `inc/`, `shared/Public.h|Trace.h`, and
  `project/upstream-audiocodec/{AudioCodec.sln,AudioCodec.vcxproj,Device.cpp,Driver.cpp,DriverSettings.h,...}`.
  These are gitignored (provenance) and reproduced by copying from
  `driver/scaffold/audapp-multi` and applying the documented Phase 21F edits
  (see `.gitignore` and the Phase 21F report).

## Commands

```powershell
cd driver\scaffold\audapp-channels

# Compile-only build -> package\Debug\x64\AudappChannels.sys + AudioChannels.inf
.\build-channels.ps1 -Configuration Debug -Platform x64

# Generate AudappChannels.cat for the staged package (no signing)
.\Generate-Catalog-channels.ps1 -Configuration Debug -Platform x64
```

`Sign-Catalog-channels.ps1` (elevated, VM-only) is for the later install phase
(21G) and is NOT run here. All three scripts include directive-level identity
guards that abort if the INF references `Audapp Input` / `ROOT\AudappInput` /
`Audapp Multi` / `ROOT\AudappMulti`.

## Expected outputs

- Raw build output: `project\upstream-audiocodec\x64\Debug\AudappChannels.sys`
- Staged package under `package\Debug\x64\`:
  - `AudappChannels.sys`
  - `AudioChannels.inf` (stamped)
  - `AudappChannels.cat` (after `Generate-Catalog-channels.ps1`; INF references `AudappChannels.cat`)
  - `package-manifest.txt`
- Build log: `project\build\AudappChannels-Debug-x64.binlog`

## Toolchain flags (compile-only)

- `VisualStudioVersion=18.0`, `WindowsTargetPlatformVersion=10.0.28000.0`
- `SignMode=Off`, `DriverPackage=False`, `SupportsPackaging=false`
- vcxproj `<TargetName>AudappChannels</TargetName>`, `<Inf Include="AudioChannels.inf" />`

## Validation

- Build must be 0 errors / 0 warnings (project builds with `/W4 /WX`).
- `Generate-Catalog-channels.ps1` runs Inf2Cat's signability test (must be clean).
- Validate the staged INF with InfVerif:
  `"C:\Program Files (x86)\Windows Kits\10\Tools\10.0.28000.0\x64\infverif.exe" /v /w package\Debug\x64\AudioChannels.inf`

## Hard warning

```text
build-channels.ps1 and Generate-Catalog-channels.ps1 do not install, load, or
enable test signing. Sign-Catalog-channels.ps1 signs package artifacts only.
Driver install / devgen / pnputil belong in the later VM phase (21G).
```
