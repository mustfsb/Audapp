# Audapp Phase 12B Driver Package Test-Signing Plan

**Date:** 2026-06-01

**Workspace:** `C:\Users\musta\Audapp`

**Planning-only safety boundary:**
- This phase is documentation-only and read-only.
- Do not perform any system-changing actions in this phase.
- Do not install or load drivers in this phase.
- Do not enable test signing.
- Do not run `bcdedit`, `pnputil`, or `devcon`.
- Do not create certificates.
- Do not sign binaries.
- Do not modify driver source.
- Do not touch boot configuration.

## 1. Current repo/build-output findings

- Current branch at inspection time: `main`
- Working tree is dirty due to untracked docs under `docs/superpowers/`
- Uncommitted docs currently present include `docs/superpowers/prompts/2026-05-30-audapp-phase-12b-driver-compile-fix-build-prompt.md`, `docs/superpowers/reports/2026-05-30-audapp-phase-12a-vm-driver-toolchain-verification.md`, `docs/superpowers/plans/2026-06-01-audapp-phase-12b-driver-package-test-signing-plan.md`, and this spec file.
- Scaffold root exists: `driver/scaffold/audapp-input`
- Inspection found raw driver outputs under `driver/scaffold/audapp-input/project/upstream-audiocodec/x64/Debug/`, including `AudioCodec.sys` and `AudioCodec.inf`
- Build log is present: `driver/scaffold/audapp-input/project/build/AudioCodec-Debug-x64.binlog`
- No `.cat` file was found under `driver/scaffold/audapp-input`
- No `driver/scaffold/audapp-input/package` staging directory exists
- Inspection snapshot: the compile-only build appears to have produced raw driver outputs rather than a complete staged driver package

## 2. Driver package readiness analysis

- Is this currently a complete installable driver package? Not yet. It has the core build artifacts needed for analysis, but it is not yet a complete, clean package for VM install testing because the package identity is still generic, there is no catalog, and there is no staged package layout.
- Does it produce an INF? Yes. The project includes `AudioCodec.inf`, and the stamped output is `driver/scaffold/audapp-input/project/upstream-audiocodec/x64/Debug/AudioCodec.inf`.
- Does it produce a CAT catalog? No. The current output folder contains `AudioCodec.sys`, `AudioCodec.inf`, and `AudioCodec.pdb`, but no `.cat`.
- If no CAT exists, what exact tool should generate it later? `Inf2Cat.exe` from the WDK, but it should run later against a staged package directory that contains the INF and the built binaries, not against the raw `x64\Debug` output folder.
- Does the INF still identify itself as generic AudioCodec, or does it contain Audapp-specific naming? It still identifies itself as generic `AudioCodec`. The provider, device description, disk, service, and friendly names are still AudioCodec-based.
- Does the INF expose a software-enumerated/root device, a real hardware ID, or an audio class device? It binds to `ROOT\AudioCodec`, so this is a software-enumerated root device, not a real hardware ID or an audio class device.
- Does it look safe to install in a VM as-is, or does it need INF/name/package cleanup first? Cleanup first is the safer recommendation. A root-enumerated sample could potentially be installable after catalog generation, but for Audapp-specific package identity and controlled VM install work, the package should first be staged, cataloged, and renamed/reframed as Audapp Input.
- Is this ACX sample scaffold suitable for the next install test, or should Phase 12C first rename/package it as Audapp Input? Phase 12C should first rename and package it as `Audapp Input`. That is the safer path before the next install test because it aligns the package identity, staging, and catalog flow with the intended VM test target.

### Why install should not happen yet

The current state is enough to prove the sample can build an INF and driver binary, but not enough to represent a clean install package for Audapp. The minimum install-ready criteria for a VM test are a staged package folder, a generated catalog, and a settled Audapp package identity; until those are in place, installing would mainly validate the upstream `AudioCodec` scaffold rather than the intended Audapp package.

## 3. VM-only test-signing strategy

This section is for a future phase only. Do not run any of the commands below in Phase 12B.

Snapshot-first rule:
- Shut down the VM cleanly before changing signing state.
- Create a VMware snapshot named `Audapp driver compile green before test signing`.
- Record the snapshot creation time in the future phase report.
- If the future signing/install pass fails, revert to this snapshot before attempting another signing/install pass.

WARNING: EXAMPLE FOR A LATER PHASE ONLY. DO NOT EXECUTE THIS BLOCK IN PHASE 12B.

Future-phase-only PowerShell sketch:

```powershell
# Run only in the VM, only from an elevated PowerShell session, and only in a future phase.
$certDir = 'C:\Users\musta\Documents\Audapp\driver-test-signing'
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject 'CN=Audapp Driver Test' `
  -CertStoreLocation 'Cert:\LocalMachine\My' `
  -KeyAlgorithm RSA `
  -KeyLength 4096 `
  -HashAlgorithm SHA256 `
  -NotAfter (Get-Date).AddYears(2)

$cerPath = Join-Path $certDir 'Audapp Driver Test.cer'
$pfxPath = Join-Path $certDir 'Audapp Driver Test.pfx'
$pwd = Read-Host -AsSecureString 'Enter export password for the PFX'

Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd | Out-Null
Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\LocalMachine\TrustedPublisher' | Out-Null

bcdedit /set testsigning on
Restart-Computer
```

Operational notes for the future phase:
- Secure Boot can block or complicate test-signing mode; confirm the VM boot policy allows the intended test-signing workflow before proceeding.
- The trust-store imports into `Cert:\LocalMachine\Root` and `Cert:\LocalMachine\TrustedPublisher` are acceptable only inside an isolated, throwaway VM for this test flow, and should be treated as temporary VM-only state.
- The future signing/install actions require elevation when they are run.
- The catalog is the package-critical install artifact. If `SYS` signing is mentioned or performed, treat it as optional extra verification rather than the core package requirement.
- Verify signatures before any future `pnputil` install attempt.
- To undo test signing later, run `bcdedit /set testsigning off` and reboot.
- Preferred cleanup is to revert the VM snapshot after the test cycle. If snapshot revert is not used, remove temporary trust-store changes and discard the temporary cert material from `C:\Users\musta\Documents\Audapp\driver-test-signing`.

## 4. Catalog generation and package staging plan

This section is future-phase-only. Do not run any of the commands below in Phase 12B.

This flow is catalog-first: the catalog is the package-critical install artifact, and signing/verifying the catalog is the package gate before any SYS-specific verification.

Verified WDK tool paths in this VM:
- `C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\stampinf.exe`
- `C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe`
- `C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x86\Inf2Cat.exe`

Notes:
- `Inf2Cat.exe` is present only under the `x86` WDK folder here, not under `x64`.
- The current stage path still reflects the upstream `AudioCodec` scaffold; package renaming and cleanup are deferred to the next phase.
- If `SYS` signing or verification is mentioned later, treat it as optional extra verification or optional extra signing, not the core packaging requirement.

Future-phase-only staging and catalog command sketch:

```powershell
# Run only in a future phase, not in Phase 12B.
$stageDir = 'C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64'
$srcDir = 'C:\Users\musta\Audapp\driver\scaffold\audapp-input\project\upstream-audiocodec\x64\Debug'

New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

Copy-Item -Force -Path (Join-Path $srcDir 'AudioCodec.inf') -Destination $stageDir
Copy-Item -Force -Path (Join-Path $srcDir 'AudioCodec.sys') -Destination $stageDir

& 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\stampinf.exe' `
  -f (Join-Path $stageDir 'AudioCodec.inf') `
  -c 'AudioCodec.cat' `
  -d '*' `
  -v '*' `
  -a amd64 `
  -k 1.31

& 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x86\Inf2Cat.exe' `
  /driver:$stageDir `
  /os:10_VB_X64 `
  /verbose
```

Future-phase-only signing and verification sketch:

```powershell
# Run only in a future phase, not in Phase 12B.
$stageDir = 'C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64'
$catPath = Join-Path $stageDir 'AudioCodec.cat'
$sysPath = Join-Path $stageDir 'AudioCodec.sys'
$certName = 'CN=Audapp Driver Test'

# Sign the package-critical catalog first.
& 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe' `
  sign /fd SHA256 /n $certName /s My /sm /v /tr http://timestamp.digicert.com /td SHA256 `
  $catPath

# Verify the catalog signature before any package install attempt.
& 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe' `
  verify /v /pa $catPath

# Optional extra signing and verification only:
# & 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe' `
#   sign /fd SHA256 /n $certName /s My /sm /v /tr http://timestamp.digicert.com /td SHA256 `
#   $sysPath
# & 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe' `
#   verify /v /kp $sysPath
```

## 5. Future install/load test plan

This section is future-phase-only. Do not execute any of the commands below in Phase 12B.

Future execution order:

1. Create a VMware snapshot.
2. Open an elevated PowerShell session inside the VM.
3. Enable test signing if required, then reboot.
4. Create and import the VM-only test certificate.
5. Stage the package into `driver/scaffold/audapp-input/package/Debug/x64`.
6. Generate the catalog from the staged package.
7. Sign the package-critical catalog and verify signatures before any install attempt.
8. Attempt install with `pnputil`.
9. Inspect the result using a root-enumerated decision tree.
10. Inspect Device Manager.
11. Inspect Windows audio endpoints.
12. Inspect the Audapp Devices page.
13. If the snapshot-revert path is chosen, revert the VMware snapshot and stop there.
14. If the manual cleanup path is chosen, remove created device instances if present, delete the published driver package, disable test signing if it was enabled, and then reboot.

Root-enumerated install decision tree:

- Expected/likely outcome: because the INF targets `ROOT\AudioCodec`, `pnputil /add-driver ... /install` may successfully stage the package into the driver store without creating a brand-new root-enumerated device node.
- Outcome A: the package is staged and binds to an already-existing matching `ROOT\AudioCodec` instance. In that case, record the published `oem#.inf` name, record the bound device instance ID, then inspect Device Manager, Windows audio endpoints, and the Audapp Devices page.
- Outcome B: the package is staged but no new `ROOT\AudioCodec` instance is created. Treat this as a likely root-enumeration result, not as a surprising edge case. In that case, stop and evaluate a separate root-device-creation step before claiming install readiness.
- Conditional fallback only if Outcome B occurs: evaluate `devcon` as a later-phase root-device-creation fallback. Do not require it up front, and do not treat it as part of the default install path.
- If `devcon` is used later, inspect carefully for duplicate `ROOT\AudioCodec` instances before any repeated retry, because repeated root-device creation can leave multiple ghost or active software devices behind.

Rollback paths:

- Preferred path: revert the VMware snapshot. This is the safest cleanup path because it removes driver-store changes, certificate-store changes, boot-policy changes, and any created root device instances in one step.
- Manual path: use only if snapshot revert is intentionally not used. Manual cleanup must resolve the published driver-store name, identify any created `ROOT\AudioCodec` instance IDs, remove created device instances if present, then delete the staged driver package from the driver store.

Future-phase-only install/rollback command sketch:

```powershell
# Future phase only. Do not run in Phase 12B.

$stageDir = 'C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64'
$infPath = Join-Path $stageDir 'AudioCodec.inf'
$infName = Split-Path $infPath -Leaf

# This command sketch still reflects the current sample-shaped AudioCodec package state.

# Default attempt: add the staged package and let Windows install on any matching device.
pnputil /add-driver $infPath /install

# Inspect driver-store state and device state after the install attempt.
pnputil /enum-drivers
pnputil /enum-devices /connected
pnputil /enum-devices /class Media
pnputil /enum-devices /instanceid ROOT\AudioCodec* /drivers

# Resolve the actual published package name before any delete attempt.
$driverEnum = pnputil /enum-drivers | Out-String
$publishedNameMatch = [regex]::Match(
  $driverEnum,
  '(?ms)Published Name\s*:\s*(oem\d+\.inf).*?Original Name\s*:\s*' + [regex]::Escape($infName)
)
$publishedName = $publishedNameMatch.Groups[1].Value

# If no ROOT\AudioCodec instance exists after pnputil, treat that as a likely root-enumeration outcome.
# Only then consider a later-phase fallback such as:
# devcon install $infPath ROOT\AudioCodec

# If a ROOT\AudioCodec device instance exists, identify its exact instance ID before removal.
# Example inspection path:
# - Device Manager -> device properties -> Instance path
# - or pnputil /enum-devices /instanceid ROOT\AudioCodec* /drivers
# Then remove the created instance explicitly if needed:
# pnputil /remove-device "<exact-instance-id>"

# After device-instance cleanup, delete the published driver package using the resolved name.
pnputil /delete-driver $publishedName /uninstall /force

# If test signing was enabled for the test pass:
bcdedit /set testsigning off
Restart-Computer
```

Manual cleanup notes:

- Do not use an `oem#.inf` placeholder blindly. Resolve the actual published name from `pnputil /enum-drivers` output by matching the package whose `Original Name` is the staged INF name.
- If a `ROOT\AudioCodec` device instance was created or bound, record its exact instance ID before removal and verify whether more than one matching root device exists.
- If `devcon` was used to create a root instance, check especially for duplicate `ROOT\AudioCodec` nodes before deleting anything, because one install attempt can bind to one node while a repeated fallback can create another.

## 6. Risk analysis

- BSOD risk: any kernel-mode install or load attempt can destabilize the VM, even if the package signs and stages cleanly.
- Boot/test-signing risk: enabling test signing changes boot policy and requires reboots, which expands the blast radius beyond the driver package itself.
- Secure Boot conflict: Secure Boot can block or complicate test-signing mode, so the VM boot policy must be confirmed before the future install pass.
- Driver store pollution: repeated package-add attempts can leave stale `oem#.inf` entries behind and make later triage harder.
- Broken or ghost audio devices: failed or partial root-enumerated installs can leave ghosted Media devices or stale software device instances.
- Duplicate root-device creation risk: if `devcon` is used repeatedly as a fallback for `ROOT\AudioCodec`, it can create multiple root nodes and make bind/uninstall behavior harder to reason about.
- Incomplete INF risk: the current INF is still sample-shaped and may remain functionally incomplete for Audapp-specific install behavior even after catalog generation.
- Wrong hardware ID risk: `ROOT\AudioCodec` is still a generic sample root ID, not a final Audapp-specific device identity.
- Windows audio endpoint may not appear even if the driver installs: a successful package install does not guarantee that Windows exposes a usable audio endpoint.
- ACX sample is not yet the final Audapp virtual endpoint: even a successful sample install may validate only the upstream scaffold path, not the intended Audapp product architecture.
- Uninstall failure risk: package removal can fail, leave a published package behind, or require force deletion, explicit device-instance removal, reboot, or snapshot revert.
- Rollback strategy risk: manual cleanup is more error-prone than snapshot revert because it requires correct identification of both the published package name and any created root device instance IDs.
- VM snapshot strategy: snapshot-before-change is mandatory so boot-policy, certificate-store, driver-store, and device-instance changes can be discarded in one step.

## 7. Recommended Phase 12C scope

Recommendation: **Option B**

Option B remains the safest next step because the evidence is stronger than just generic package naming. The current package still presents generic `AudioCodec` identity, the INF still targets `ROOT\AudioCodec`, the root-enumeration behavior is still unresolved for an execution-ready install path, the cleanup mechanics are not yet proven end-to-end, and the install/remove flow still needs a clearer decision tree before any real VM execution should be treated as disciplined or repeatable.

Recommended Phase 12C scope:

- Rename package-facing INF strings and related package identity from generic `AudioCodec` wording to Audapp-specific naming.
- Preserve the compile-only green path while introducing a deterministic staging layout under `driver/scaffold/audapp-input/package/Debug/x64`.
- Ensure the staged package contains the future install-critical artifacts at minimum: `.inf`, `.sys`, and later-generated `.cat`.
- Keep the root-enumerated install decision tree explicit: default `pnputil` attempt first, then a separate evaluation step if no new root node is created.
- Document manual cleanup mechanics alongside the preferred snapshot-revert path so future execution does not rely on placeholders or assumptions.
- Keep signing, install/load execution, and endpoint validation out of Phase 12C unless a later spec explicitly promotes them.

Why not Option A:

- Option A would move too early into signing/install execution while package identity is still sample-branded, root-enumeration behavior is still unresolved, and cleanup mechanics are not yet stable enough for repeatable testing.
- Even with catalog-first staging now understood, the install/remove path is still not execution-ready enough to justify a VM driver-install phase as the immediate next step.

Why not Option C:

- Option C would expand toward final-product endpoint behavior before the package identity, root-device behavior, and rollback path are settled.
- Productization work is not durable yet because it would build on top of an install path that still has unresolved root-enumeration and cleanup decisions.

## 8. Verification checklist

- [ ] The future execution order explicitly covers snapshot creation, elevation, optional test-signing enablement, reboot, certificate creation/import, staging, catalog generation, catalog signing, install attempt, inspection, rollback, and test-signing disablement.
- [ ] The `ROOT\AudioCodec` root-enumerated model is described as a likely reason that `pnputil` may stage the package without creating a new device node.
- [ ] The install flow includes a decision tree that separates package-staged-and-bound behavior from package-staged-with-no-new-root-node behavior.
- [ ] Any `devcon` mention remains conditional and is documented only as a fallback if `pnputil` does not yield a usable root device instance.
- [ ] The rollback plan has two explicit paths: preferred snapshot revert and manual cleanup.
- [ ] The manual cleanup path explains how to resolve the actual published `oem#.inf` name from `pnputil` output before deletion.
- [ ] The manual cleanup path explains how to identify and remove a created `ROOT\AudioCodec` device instance if one exists.
- [ ] The duplicate-root-node risk from repeated `devcon` fallback use is explicitly documented.
- [ ] The risk section covers BSOD risk, boot/test-signing risk, Secure Boot conflict, driver-store pollution, ghost devices, duplicate root devices, incomplete INF risk, wrong hardware-ID risk, missing audio endpoints, sample-vs-product gap, uninstall failure, rollback strategy, and VM snapshot strategy.
- [ ] The Phase 12C recommendation remains clearly stated as Option B and is justified by unresolved root-enumeration behavior, incomplete cleanup mechanics, and the lack of a fully execution-ready install decision tree.
- [ ] The section remains planning-only and does not promote any install, signing, certificate, or boot-configuration action into Phase 12B.
