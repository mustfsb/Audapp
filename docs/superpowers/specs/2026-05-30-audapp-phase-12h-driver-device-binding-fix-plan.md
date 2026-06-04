# Audapp Phase 12H Driver Device Binding Fix Plan

**Date:** 2026-06-02

**Workspace:** `C:\Users\musta\Audapp`

**Phase boundary:** Documentation-only. This phase writes the diagnosis and the next VM build prompt, but it does not remove devices, delete driver packages, create another root device, or modify app/routing code.

## 1. Current 12G result

Phase 12G successfully created a single root DEVGEN node:

```text
ROOT\DEVGEN\AUDAPP12G0001
```

The node is still present and carries the expected Audapp hardware ID, but it is not actually bound to the Audapp Media driver stack yet.

Observed device state from read-only inspection:

| Field | Observed value |
|-------|----------------|
| Instance ID | `ROOT\DEVGEN\AUDAPP12G0001` |
| Hardware ID | `ROOT\AudappInput` |
| Compatible IDs | `ROOT\DevGenDevice`, `DevGenDevice` |
| `Get-PnpDevice` status | `OK` |
| `devcon status` | `Device is currently stopped` |
| `DEVPKEY_Device_DriverInfPath` | empty |
| `Service` | empty |
| `ClassGuid` | `{00000000-0000-0000-0000-000000000000}` |
| `ProblemCode` | `0` |
| Media class presence | not present |
| MMDevice endpoint | not present |

This is a binding gap, not proof of a stale package and not proof that the root device creation itself failed.

## 2. Proof that driver-store drift is false

The strongest early hypothesis was that `oem9.inf` might be stale compared to the current staged INF. Read-only comparison does not support that hypothesis.

Inspected files:

- Staged INF:
  `C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64\AudioCodec.inf`
- Driver-store INF:
  `C:\Windows\System32\DriverStore\FileRepository\audiocodec.inf_amd64_8d986fabe7b0da4d\AudioCodec.inf`

Observed result:

- Both files have the same SHA256:
  `7CD1F64DDDE017EA049A36E817E35733B63CE060BBF76CE45C26B8EE9B70343F`
- `Compare-Object` reported no content drift.
- `pnputil /enum-drivers` still shows the expected published package:

```text
Published Name:     oem9.inf
Original Name:      audiocodec.inf
Provider Name:      Audapp
Signer Name:        Audapp VM Test Code Signing
Driver Version:     06/02/2026 1.29.27.380
```

Conclusion: `oem9.inf` is current for the inspected VM state. Phase 12H should not default to deleting or republishing it.

## 3. Proof that the staged INF is structurally valid for this VM

The staged INF is structurally aligned with the current VM and package identity.

Confirmed INF facts:

- `Class=MEDIA`
- `ClassGuid={4d36e96c-e325-11ce-bfc1-08002be10318}`
- `CatalogFile=AudioCodec.cat`
- Manufacturer target:
  `[Standard.NTamd64.10.0...19041]`
- Model entry:
  `%AudioCodec.DeviceDesc%=Audio_Device, ROOT\AudappInput`
- Service install section:
  `AddService = AudioCodec, %SPSVCINST_ASSOCSERVICE%, Audio_Service_Inst`

Confirmed VM facts:

- Windows product: `Windows 10 Home`
- OS version: `10.0.19045`
- Architecture: `64 bit`

The model section, hardware ID, class, and service definitions line up with the inspected Windows 10 x64 VM. No Phase 12H evidence points to an INF architecture or identity defect that must be fixed before trying an in-place bind.

## 4. Proof that matching exists but binding did not complete

The most important new finding is that Windows already sees a valid signed candidate driver node for the existing DEVGEN instance.

Read-only command:

```powershell
& 'C:\Program Files (x86)\Windows Kits\10\Tools\10.0.28000.0\x64\devcon.exe' `
  drivernodes '@ROOT\DEVGEN\AUDAPP12G0001'
```

Observed result:

- INF file: `C:\Windows\INF\oem9.inf`
- INF section: `Audio_Device`
- Driver description: `Audapp Input`
- Manufacturer: `Audapp`
- Provider: `Audapp`
- Driver node flags include digital signature

This changes the diagnosis materially:

- Windows does have a matching Audapp driver candidate for the current node.
- The problem is not "no matching package found."
- The problem is that no actual update/bind step completed for the existing node after `devgen` creation.

Root-cause statement for Phase 12H:

> `devgen` created the root node successfully and assigned `ROOT\AudappInput`, but the node never transitioned from a generic classless DEVGEN placeholder into the installed Audapp Media device stack. A candidate driver node from `oem9.inf` exists already, so the missing action is the driver bind/update itself, not package repair or duplicate root creation.

## 5. Option review

### Option A - rescan/restart only

Reject as the default fix.

Why:

- The node is still classless and has no service or installed INF path.
- `pnputil /restart-device` is weak when there is no installed driver stack yet.
- `pnputil /scan-devices` is still useful immediately after the chosen bind attempt, but it is not strong enough as the only intervention.

### Option B - update/rebind the existing DEVGEN node in place

Recommend this option.

Why:

- Exactly one relevant DEVGEN node already exists.
- `oem9.inf` is current, not stale.
- The INF is structurally valid for this VM.
- `devcon drivernodes` already resolves the current node to `oem9.inf` and `Audio_Device`.
- Microsoft guidance favors `pnputil /add-driver <inf> /install` as the modern replacement for `devcon update`, while `devcon install` creates a devnode and is therefore the wrong default once the node already exists.

### Option C - remove node, delete package, republish, create another root device

Reject for Phase 12H.

Why:

- There is no evidence that the package is stale.
- There is no duplicate Audapp node yet.
- Removing the node or deleting `oem9.inf` would add unnecessary rollback risk before the simpler in-place bind path is tried.

### Option D - fix INF/package metadata first

Reject for Phase 12H.

Why:

- Current evidence does not show a model, hardware-ID, architecture, or catalog mismatch that blocks matching.
- The core missing state is installed driver binding, not package identity.

### Option E - abandon `devgen`

Reject for Phase 12H.

Why:

- `devgen` already produced the exact instance under investigation.
- That instance already resolves to the Audapp driver candidate through `devcon drivernodes`.
- There is not enough evidence to conclude the creation method itself is incompatible with binding.

## 6. Recommended fix path

Phase 12H should generate a rebind-only VM build prompt that:

1. Requires elevated admin PowerShell.
2. Requires a fresh VMware snapshot before any mutation.
3. Verifies the working tree state with:
   - `git status --short`
   - `git branch --show-current`
4. Verifies there is exactly one Audapp-related root/devgen node and that it is still:
   - `ROOT\DEVGEN\AUDAPP12G0001`
   - unbound before mutation (`DriverInfPath` and `Service` empty)
5. Verifies the staged/store INF hashes still match.
6. Verifies the candidate driver node still resolves to `oem9.inf`.
7. Performs exactly one bind attempt:

```powershell
pnputil /add-driver "C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64\AudioCodec.inf" /install
pnputil /scan-devices
```

8. Re-checks:
   - `Get-PnpDevice`
   - targeted `Get-PnpDeviceProperty`
   - `devcon stack`
   - `devcon status`
   - `devcon drivernodes`
   - `pnputil /enum-devices /class Media`
   - optional `Win32_SoundDevice`
9. Stops immediately if binding still fails.

Phase 12H explicitly does **not** authorize:

- `pnputil /remove-device`
- `pnputil /delete-driver oem9.inf`
- `devcon install`
- a second `devgen`
- `devcon install <inf> ROOT\AudappInput`
- any cleanup fallback in the same prompt

## 7. Duplicate prevention, rollback, and risks

### Duplicate prevention

Both the spec and the next build prompt must abort if:

- more than one Audapp-related `ROOT\DEVGEN\*` or `ROOT\AudappInput*` node is present
- `ROOT\DEVGEN\AUDAPP12G0001` is missing
- the staged/store INF hashes no longer match
- the candidate driver node no longer resolves to `oem9.inf`

### Rollback

Preferred rollback for the next build is snapshot revert only.

Phase 12H should not automate:

- `pnputil /remove-device "ROOT\DEVGEN\AUDAPP12G0001"`
- `pnputil /delete-driver oem9.inf /uninstall /force`

If the single rebind attempt fails, the correct outcome is a stop-and-report, not same-session cleanup experimentation.

### Risks to keep visible

- The bind attempt may still fail even though a candidate driver node exists.
- The device may bind successfully without exposing an MMDevice endpoint yet.
- A successful bind would prove driver attachment, not full endpoint exposure.
- The compile-only ACX sample may require a later endpoint-exposure phase even after a clean Media-class bind.

## 8. Verification targets

### Preflight success case

Before the bind attempt, the future build must confirm all of the following:

- exactly one Audapp-related root/devgen node exists
- that node is `ROOT\DEVGEN\AUDAPP12G0001`
- `devcon drivernodes` still resolves that node to `oem9.inf` / `Audio_Device`
- `DriverInfPath` is empty
- `Service` is empty

### Bind success case

Treat Phase 12H as successful if the future build shows all of the following after the single bind attempt:

- the same node is still the only Audapp-related root/devgen node
- `Get-PnpDevice` or `Win32_PnPSignedDriver` shows the node bound to the Audapp package
- `DEVPKEY_Device_DriverInfPath` is populated
- `Service` becomes `AudioCodec`
- the device enters the Media class
- `devcon stack` no longer reports an empty controlling service

### Partial-success case

Treat a successful bind with no visible MMDevice endpoint as a partial success, not as a binding failure.

That outcome should trigger a follow-on endpoint-exposure phase rather than Phase 12H cleanup.

### Abort cases

The future build must stop and report without cleanup if any of the following is true:

- non-admin shell
- no fresh snapshot confirmation
- missing node
- duplicate Audapp root/devgen nodes
- staged/store INF hash drift
- missing `oem9.inf` candidate driver node
- bind attempt leaves the node classless with empty `DriverInfPath` or `Service`

## 9. Assumptions and defaults

- Keep the `2026-05-30` filenames even though the plan was written on 2026-06-02, because the existing Phase 12 artifact series already uses that date prefix.
- Use `devcon.exe` for inspection only and `pnputil /add-driver ... /install` for the single mutating bind attempt.
- Do not use `devcon install`, because that creates a devnode and Phase 12H is explicitly reusing an existing node.
- Treat snapshot revert as the only rollback default in this phase.

## 10. Exact next step

Run the rebind-only VM build prompt at:

`C:\Users\musta\Audapp\docs\superpowers\prompts\2026-05-30-audapp-phase-12h-driver-rebind-build-prompt.md`

That prompt should attempt exactly one in-place bind of the existing DEVGEN node, then stop and report without cleanup or duplicate root-device creation.
