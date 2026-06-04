# Audapp - Phase 12H Driver Rebind Build Prompt

## Target Thread
Audapp - Phase 12H Driver Rebind

## Target Agent
Composer-2.5 or Codex

## Suggested Model / Effort
GPT-5.x - High effort

## Mode
Build mode (VM-only, one in-place bind attempt)

## Suggested Skills
- `verification-before-completion`
- `windows-driver`
- `wdk`
- `driver-install`
- `root-enumerated-device`
- `pnputil`
- `devcon`
- `powershell`
- `debugging`
- `rollback-planning`

## Project Name
Audapp

## Project Path
```text
C:\Users\musta\Audapp
```

---

## Prompt

You are working on **Audapp**, a Windows desktop audio control application moving toward real virtual audio driver and routing support.

This task is **Phase 12H: Driver Rebind**.

The current evidence says the existing DEVGEN node already has a valid signed driver candidate from `oem9.inf`, so this phase should attempt **one controlled in-place bind** of the existing node. Do **not** remove devices, do **not** delete driver packages, and do **not** create another root device in this phase.

Do **not** commit unless the user explicitly asks later.

---

# Current State

## Existing node

| Field | Value |
|-------|--------|
| Instance ID | **`ROOT\DEVGEN\AUDAPP12G0001`** |
| Hardware ID | `ROOT\AudappInput` |
| Current PnP state | present, classless, stopped |
| Current `DriverInfPath` | empty |
| Current `Service` | empty |
| Current `ProblemCode` | `0` |

## Driver package

| Field | Value |
|-------|--------|
| Published package | **`oem9.inf`** |
| Original INF | `audiocodec.inf` |
| Provider | `Audapp` |
| Driver version | `06/02/2026 1.29.27.380` |
| Stage INF | `C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64\AudioCodec.inf` |

## Important diagnosis already established

- The staged INF and the driver-store INF behind `oem9.inf` matched by SHA256 during Phase 12H planning.
- The staged INF is structurally valid for this Windows 10 x64 VM.
- `devcon drivernodes "@ROOT\DEVGEN\AUDAPP12G0001"` already showed a signed candidate driver node from `C:\Windows\INF\oem9.inf` using section `Audio_Device`.
- The likely gap is that the node never completed an actual driver bind/update step after `devgen` created it.

---

# Required Reading

Read these first:

```text
docs/superpowers/specs/2026-05-30-audapp-phase-12h-driver-device-binding-fix-plan.md
docs/superpowers/reports/2026-05-30-audapp-phase-12g-root-device-creation-build-report.md
docs/superpowers/reports/2026-05-30-audapp-phase-12f-vm-driver-install-dry-run-report.md
driver/scaffold/audapp-input/package/Debug/x64/AudioCodec.inf
```

---

# Objective

Attempt exactly one safe in-place bind of the existing `ROOT\DEVGEN\AUDAPP12G0001` node to the already-published Audapp driver package, then verify the resulting device state.

Do not:

- remove `ROOT\DEVGEN\AUDAPP12G0001`
- delete `oem9.inf`
- run `devcon install`
- run another `devgen`
- create any second root device
- fall through to cleanup or republish steps in the same session

---

# Hard Safety Boundaries

- **VM only**
- **Elevated Administrator PowerShell only**
- Require a **fresh VMware snapshot** before any mutating command
- If the user has not explicitly confirmed a fresh snapshot in-thread, stop before mutation and ask for it
- Abort on duplicate Audapp-related root/devgen nodes
- Abort on staged/store INF hash drift
- Abort if the candidate driver node no longer resolves to `oem9.inf`
- If the bind attempt fails, stop and report; do not improvise cleanup

---

# Execution Steps

## 1. Set constants and confirm elevation

Run:

```powershell
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$workspace = 'C:\Users\musta\Audapp'
$stageInf = 'C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64\AudioCodec.inf'
$targetInstance = 'ROOT\DEVGEN\AUDAPP12G0001'
$driverStoreRoot = 'C:\Windows\System32\DriverStore\FileRepository'
$devcon = 'C:\Program Files (x86)\Windows Kits\10\Tools\10.0.28000.0\x64\devcon.exe'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host "IsAdmin: $isAdmin"
if (-not $isAdmin) {
    throw 'Abort: elevated Administrator PowerShell is required.'
}
```

## 2. Capture repo state and snapshot precondition

Run:

```powershell
Set-Location $workspace
git status --short
git branch --show-current
```

If the user has not explicitly confirmed a fresh VMware snapshot for this rebind attempt, stop here and ask for that confirmation before running any mutating command.

## 3. Verify there is exactly one Audapp-related node

Run:

```powershell
$audappDevgenNodes = @(
    Get-CimInstance Win32_PnPEntity | Where-Object {
        $_.PNPDeviceID -like 'ROOT\DEVGEN\*' -and
        $_.HardwareID -contains 'ROOT\AudappInput'
    }
)

$audappRootNodes = @(
    Get-CimInstance Win32_PnPEntity | Where-Object {
        $_.PNPDeviceID -like 'ROOT\AudappInput*'
    }
)

$allAudappNodeIds = @(
    $audappDevgenNodes.PNPDeviceID
    $audappRootNodes.PNPDeviceID
) | Where-Object { $_ } | Sort-Object -Unique

$allAudappNodeIds

if ($allAudappNodeIds.Count -ne 1) {
    throw "Abort: expected exactly one Audapp-related root/devgen node, found $($allAudappNodeIds.Count)."
}

if ($allAudappNodeIds[0] -ne $targetInstance) {
    throw "Abort: expected the single Audapp node to be $targetInstance but found $($allAudappNodeIds[0])."
}
```

## 4. Verify pre-bind state is still the expected unbound state

Run:

```powershell
Get-PnpDevice | Where-Object {
    $_.InstanceId -eq $targetInstance -or $_.InstanceId -like 'ROOT\AudappInput*'
} | Format-List *

$preDriverInf = Get-PnpDeviceProperty -InstanceId $targetInstance -KeyName DEVPKEY_Device_DriverInfPath
$preService = Get-PnpDeviceProperty -InstanceId $targetInstance -KeyName DEVPKEY_Device_Service
$preProblem = Get-PnpDeviceProperty -InstanceId $targetInstance -KeyName DEVPKEY_Device_ProblemCode

$preDriverInf | Format-List KeyName, Data, Type
$preService | Format-List KeyName, Data, Type
$preProblem | Format-List KeyName, Data, Type

if ($preDriverInf.Data) {
    throw "Abort: DriverInfPath is already populated ($($preDriverInf.Data)); this node is no longer in the expected pre-bind state."
}

if ($preService.Data) {
    throw "Abort: Service is already populated ($($preService.Data)); this node is no longer in the expected pre-bind state."
}

if ($preProblem.Data -ne 0) {
    throw "Abort: ProblemCode changed to $($preProblem.Data) before the bind attempt."
}
```

## 5. Verify staged/store INF hash match

Run:

```powershell
$storeInfMatches = @(
    Get-ChildItem $driverStoreRoot -Recurse -Filter AudioCodec.inf -ErrorAction Stop |
        Where-Object { $_.FullName -like '*audiocodec.inf_*' } |
        Select-Object -ExpandProperty FullName
)

$storeInfMatches

if ($storeInfMatches.Count -ne 1) {
    throw "Abort: expected exactly one driver-store AudioCodec.inf candidate, found $($storeInfMatches.Count)."
}

$storeInf = $storeInfMatches[0]
$stageHash = (Get-FileHash $stageInf -Algorithm SHA256).Hash
$storeHash = (Get-FileHash $storeInf -Algorithm SHA256).Hash

Write-Host "StageHash: $stageHash"
Write-Host "StoreHash: $storeHash"

if ($stageHash -ne $storeHash) {
    throw 'Abort: staged/store INF hashes diverge.'
}
```

## 6. Verify the current node still resolves to `oem9.inf`

Run:

```powershell
$driverNodeOutput = & $devcon drivernodes "@$targetInstance"
$driverNodeOutput

if ($driverNodeOutput -notmatch 'C:\\Windows\\INF\\oem9\.inf') {
    throw 'Abort: candidate driver node no longer points to C:\Windows\INF\oem9.inf.'
}

if ($driverNodeOutput -notmatch 'Inf section is Audio_Device') {
    throw 'Abort: candidate driver node no longer resolves to the Audio_Device section.'
}
```

## 7. Perform exactly one bind attempt

Run:

```powershell
pnputil /add-driver "$stageInf" /install
pnputil /scan-devices
Start-Sleep -Seconds 2
```

Do not run any other mutating driver/device command in this phase.

## 8. Re-verify device state after the bind attempt

Run:

```powershell
Get-PnpDevice | Where-Object {
    $_.InstanceId -eq $targetInstance -or $_.InstanceId -like 'ROOT\AudappInput*'
} | Format-List *

Get-PnpDeviceProperty -InstanceId $targetInstance -KeyName DEVPKEY_Device_DriverInfPath | Format-List KeyName, Data, Type
Get-PnpDeviceProperty -InstanceId $targetInstance -KeyName DEVPKEY_Device_Service | Format-List KeyName, Data, Type
Get-PnpDeviceProperty -InstanceId $targetInstance -KeyName DEVPKEY_Device_ProblemCode | Format-List KeyName, Data, Type

& $devcon status "@$targetInstance"
& $devcon stack "@$targetInstance"
& $devcon drivernodes "@$targetInstance"

pnputil /enum-devices /class Media

Get-CimInstance Win32_PnPSignedDriver | Where-Object {
    $_.DeviceID -eq $targetInstance -or
    $_.InfName -eq 'oem9.inf' -or
    $_.DriverProviderName -eq 'Audapp'
} | Format-List *

Get-CimInstance Win32_SoundDevice | Where-Object {
    $_.Name -like '*Audapp*' -or $_.Name -like '*AudioCodec*'
} | Format-List *

$postAudappDevgenNodes = @(
    Get-CimInstance Win32_PnPEntity | Where-Object {
        $_.PNPDeviceID -like 'ROOT\DEVGEN\*' -and
        $_.HardwareID -contains 'ROOT\AudappInput'
    }
)

$postAudappRootNodes = @(
    Get-CimInstance Win32_PnPEntity | Where-Object {
        $_.PNPDeviceID -like 'ROOT\AudappInput*'
    }
)

$postAudappNodeIds = @(
    $postAudappDevgenNodes.PNPDeviceID
    $postAudappRootNodes.PNPDeviceID
) | Where-Object { $_ } | Sort-Object -Unique

$postAudappNodeIds
```

## 9. Evaluate outcome and stop cleanly

Use these rules:

- **Success** if the existing node is now bound to the Audapp package, `DriverInfPath` is populated, `Service` becomes `AudioCodec`, the device class becomes Media, and no extra Audapp root/devgen node was created.
- **Partial success** if the driver binds but no MMDevice endpoint appears. Report that as an endpoint-exposure follow-on, not a binding failure.
- **Failure** if the node remains classless, `DriverInfPath` stays empty, `Service` stays empty, or duplicates appear.

If failure occurs:

- stop immediately
- do not remove the node
- do not delete `oem9.inf`
- do not create another root device
- do not improvise `devcon install`, cleanup, or republish steps

---

# Deliverable

Write the build report to:

```text
docs/superpowers/reports/2026-05-30-audapp-phase-12h-driver-rebind-build-report.md
```

The report must include:

1. elevation status
2. snapshot confirmation status
3. exact preflight outputs
4. staged/store hash comparison
5. candidate driver-node output
6. exact bind command output
7. post-bind verification results
8. whether binding succeeded, partially succeeded, or failed
9. whether a follow-on endpoint-exposure prompt is needed
10. exact next step

---

# Command Rationale

Prefer `pnputil /add-driver <inf> /install` for the actual bind attempt. Microsoft documents it as the preferred replacement for `devcon update`, while `devcon install` creates a new devnode and is therefore the wrong tool when an Audapp node already exists.

References:

- [PnPUtil Command Syntax](https://learn.microsoft.com/ro-ro/windows-hardware/drivers/devtest/pnputil-command-syntax)
- [DevCon Update](https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/devcon-update)
- [DevGen Command Syntax](https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/devgen-command-syntax)
- [DevCon Overview](https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/devcon)

---

# Final Response Format

Report directly and practically:

1. Whether the rebind was attempted
2. Whether the node bound to `oem9.inf`
3. Whether `DriverInfPath` populated
4. Whether `Service` became `AudioCodec`
5. Whether the device entered the Media class
6. Whether an MMDevice endpoint appeared
7. Whether any duplicate node appeared
8. Path to the build report
9. Exact next step

---

## Very Short Summary

This phase should try exactly one safe in-place bind of `ROOT\DEVGEN\AUDAPP12G0001` to the already-published Audapp package, verify the result, and stop without cleanup or new root-device creation.
