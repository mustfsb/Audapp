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
pwsh -File .\prepare.ps1 -SampleRoot C:\path\to\Windows-driver-samples
```

Attempt compile-only:

```powershell
pwsh -File .\build.ps1 -SampleRoot C:\path\to\Windows-driver-samples
```

If preparation already ran and imported the upstream files:

```powershell
pwsh -File .\build.ps1
```

## Expected outputs

- solution and project files under `project\upstream-audiocodec\`
- if build succeeds, WDK outputs such as `.sys`, `.inf`, `.cat`, and standard intermediate directories

## Troubleshooting

- `SampleRoot does not exist`: point `-SampleRoot` to a real `Windows-driver-samples` checkout
- `Windows Kits build tools were not found`: install a matching WDK
- `msbuild was not found after entering the developer shell`: repair Visual Studio build tools or use a proper developer command environment
- upstream sample imported but build still fails: stop and document the error before making wider source changes

## Hard warning

```text
Do not install, load, sign, or test-sign any driver as part of this build flow.
```
