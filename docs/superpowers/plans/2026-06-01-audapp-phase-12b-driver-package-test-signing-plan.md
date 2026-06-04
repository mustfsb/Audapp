# Audapp Phase 12B Driver Package + Test Signing Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the Phase 12B planning artifacts for Audapp's driver package and VM-only test-signing path without changing driver source, boot configuration, signatures, or installed drivers.

**Architecture:** Use read-only inspection of the current ACX scaffold, build outputs, WDK tool paths, and existing Phase 12A docs to author two documentation artifacts. The main artifact is a Phase 12B planning document under `docs/superpowers/specs` that captures package readiness, signing strategy, install and rollback planning, risks, and a Phase 12C recommendation. The second artifact is exactly one Build mode prompt under `docs/superpowers/prompts`; based on the current repo state, the recommended next phase is package cleanup before any signing or installation.

**Tech Stack:** PowerShell, Git, Markdown, ACX/KMDF scaffold inspection, WDK tooling references (`stampinf.exe`, `Inf2Cat.exe`, `signtool.exe`, `pnputil.exe`).

---

## File Map

- Reference: `C:\Users\musta\Audapp\driver\scaffold\audapp-input\build.ps1`
  Responsibility: confirm the scaffold is intentionally compile-only via `SignMode=Off`, `DriverPackage=False`, and `SupportsPackaging=false`.
- Reference: `C:\Users\musta\Audapp\driver\scaffold\audapp-input\prepare.ps1`
  Responsibility: confirm imported upstream sample provenance and the absence of package staging logic.
- Reference: `C:\Users\musta\Audapp\driver\scaffold\audapp-input\project\upstream-audiocodec\AudioCodec.inf`
  Responsibility: source INF identity, catalog declaration, and device model.
- Reference: `C:\Users\musta\Audapp\driver\scaffold\audapp-input\project\upstream-audiocodec\AudioCodec.vcxproj`
  Responsibility: confirm driver project metadata and packaging-related items.
- Reference: `C:\Users\musta\Audapp\driver\scaffold\audapp-input\project\upstream-audiocodec\x64\Debug\AudioCodec.inf`
  Responsibility: confirm stamped `DriverVer` output and final INF content emitted by the compile-only build.
- Reference: `C:\Users\musta\Audapp\driver\scaffold\audapp-input\project\upstream-audiocodec\x64\Debug\AudioCodec.sys`
  Responsibility: confirm raw driver binary exists.
- Reference: `C:\Users\musta\Audapp\driver\scaffold\audapp-input\project\build\AudioCodec-Debug-x64.binlog`
  Responsibility: evidence that the compile-only build completed successfully.
- Reference: `C:\Users\musta\Audapp\docs\superpowers\reports\2026-05-30-audapp-phase-12a-vm-driver-toolchain-verification.md`
  Responsibility: carry forward the prior toolchain verification context.
- Create: `C:\Users\musta\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-12b-driver-package-test-signing-plan.md`
  Responsibility: Phase 12B planning document requested by the attached prompt.
- Create: `C:\Users\musta\Audapp\docs\superpowers\prompts\2026-05-30-audapp-phase-12c-driver-package-cleanup-build-prompt.md`
  Responsibility: single next-step prompt for the recommended Phase 12C option.
- Modify: none under `driver\`, `src\`, boot configuration, certificates, or the Windows driver store.
  Responsibility: this phase is documentation-only.

### Task 1: Freeze the read-only repo and build evidence

**Files:**
- Create: `C:\Users\musta\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-12b-driver-package-test-signing-plan.md`
- Reference: `C:\Users\musta\Audapp\driver\scaffold\audapp-input\project\upstream-audiocodec\x64\Debug\AudioCodec.inf`
- Reference: `C:\Users\musta\Audapp\driver\scaffold\audapp-input\project\upstream-audiocodec\x64\Debug\AudioCodec.sys`
- Reference: `C:\Users\musta\Audapp\driver\scaffold\audapp-input\project\build\AudioCodec-Debug-x64.binlog`

- [ ] **Step 1: Create the Phase 12B spec file header with explicit planning-only boundaries**

```markdown
# Audapp Phase 12B Driver Package + Test Signing Plan

Date: 2026-06-01
Workspace: `C:\Users\musta\Audapp`
Mode: Planning only

## Safety boundary

This document is planning-only.

- No driver install
- No driver load
- No `bcdedit`
- No `pnputil`
- No `devcon`
- No certificate creation in this phase
- No signing in this phase
- No INF or source changes in this phase
- No destructive Git cleanup
```

- [ ] **Step 2: Re-run the exact repo and output inspection commands from the prompt**

```powershell
Set-Location C:\Users\musta\Audapp
git status --short
git branch --show-current
Get-ChildItem -Force .\driver\scaffold\audapp-input
Get-ChildItem -Force .\driver\scaffold\audapp-input\project\upstream-audiocodec\x64\Debug
Get-ChildItem -Force .\driver\scaffold\audapp-input\project\build
Get-ChildItem -Recurse -File .\driver\scaffold\audapp-input -Include *.cat,*.inx
Get-ChildItem -Force .\driver\scaffold\audapp-input\package -ErrorAction SilentlyContinue
```

Expected:
- `main` is the current branch.
- `git status --short` shows the worktree is dirty from untracked docs under `docs\superpowers\`.
- `AudioCodec.sys` and `AudioCodec.inf` are present under `x64\Debug`.
- No `.cat` file is returned.
- No `package` staging directory is returned.

- [ ] **Step 3: Record the current Git and build-output findings in the spec**

```markdown
## 1. Current repo/build-output findings

- Current branch: `main`
- Working tree state: dirty
- Uncommitted docs detected:
  - `docs/superpowers/prompts/2026-05-30-audapp-phase-12b-driver-compile-fix-build-prompt.md`
  - `docs/superpowers/reports/2026-05-30-audapp-phase-12a-vm-driver-toolchain-verification.md`
- Scaffold root present: `driver/scaffold/audapp-input`
- Built output present:
  - `driver/scaffold/audapp-input/project/upstream-audiocodec/x64/Debug/AudioCodec.sys`
  - `driver/scaffold/audapp-input/project/upstream-audiocodec/x64/Debug/AudioCodec.inf`
- Build log present:
  - `driver/scaffold/audapp-input/project/build/AudioCodec-Debug-x64.binlog`
- Catalog file status: no `.cat` file found under `driver/scaffold/audapp-input`
- Package staging folder status: `driver/scaffold/audapp-input/package` does not exist
- Interpretation: the compile-only build produced raw driver outputs, not a complete staged driver package
```

- [ ] **Step 4: Save the file and verify the header and findings are present**

Run: `Get-Content -Raw C:\Users\musta\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-12b-driver-package-test-signing-plan.md`
Expected: the file contains the safety boundary section and the `## 1. Current repo/build-output findings` section above.

### Task 2: Document driver package readiness and current installability

**Files:**
- Modify: `C:\Users\musta\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-12b-driver-package-test-signing-plan.md`
- Reference: `C:\Users\musta\Audapp\driver\scaffold\audapp-input\build.ps1`
- Reference: `C:\Users\musta\Audapp\driver\scaffold\audapp-input\prepare.ps1`
- Reference: `C:\Users\musta\Audapp\driver\scaffold\audapp-input\project\upstream-audiocodec\AudioCodec.inf`
- Reference: `C:\Users\musta\Audapp\driver\scaffold\audapp-input\project\upstream-audiocodec\AudioCodec.vcxproj`

- [ ] **Step 1: Re-open the scaffold files that determine package behavior**

```powershell
Get-Content -Raw .\driver\scaffold\audapp-input\build.ps1
Get-Content -Raw .\driver\scaffold\audapp-input\prepare.ps1
Get-Content -Raw .\driver\scaffold\audapp-input\project\upstream-audiocodec\AudioCodec.inf
Get-Content -Raw .\driver\scaffold\audapp-input\project\upstream-audiocodec\x64\Debug\AudioCodec.inf
Get-Content -Raw .\driver\scaffold\audapp-input\project\upstream-audiocodec\AudioCodec.vcxproj
```

Expected:
- `build.ps1` passes `/p:SignMode=Off /p:DriverPackage=False /p:SupportsPackaging=false`.
- Both INF files still use `AudioCodec` naming.
- The INF binds `%AudioCodec.DeviceDesc%` to `ROOT\AudioCodec`.
- `AudioCodec.vcxproj` includes `<Inf Include="AudioCodec.inf" />` and `<FilesToPackage Include="$(TargetPath)" />`.

- [ ] **Step 2: Append the package-readiness analysis section with direct answers**

```markdown
## 2. Driver package readiness analysis

- Is this currently a complete installable driver package?
  - No. The current scaffold produces compile outputs only and does not stage a full package directory.
- Does it produce an INF?
  - Yes. A stamped output INF exists at `driver/scaffold/audapp-input/project/upstream-audiocodec/x64/Debug/AudioCodec.inf`.
- Does it produce a CAT catalog?
  - No. No `.cat` file currently exists under `driver/scaffold/audapp-input`.
- If no CAT exists, what exact tool should generate it later?
  - Use `C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x86\Inf2Cat.exe` against a staged package directory.
- Does the INF still identify itself as generic `AudioCodec`?
  - Yes. The provider, device description, disk text, service name, and endpoint names are still `AudioCodec` sample values.
- Does the INF expose a software-enumerated/root device, a real hardware ID, or an audio class device?
  - It targets `ROOT\AudioCodec`, so it is currently a software-enumerated root device model.
- Is it safe to install in a VM as-is?
  - No. It remains sample-branded, compile-only packaged, and lacks a generated catalog and a dedicated staging flow.
- Is this scaffold suitable for the next install test?
  - Not yet. Phase 12C should first clean up the package and rename the scaffold as `Audapp Input`.
```

- [ ] **Step 3: Capture the rationale for choosing cleanup before signing or install**

```markdown
### Why install should not happen yet

- The build script intentionally disables package generation and signing.
- The output folder contains only `AudioCodec.sys`, `AudioCodec.inf`, and `AudioCodec.pdb`.
- No `package\Debug\x64` staging folder exists.
- The INF still advertises Microsoft sample branding and `ROOT\AudioCodec`.
- A VM-only install dry run should happen only after package naming and staging are made Audapp-specific.
```

- [ ] **Step 4: Save the file and verify the readiness section answers all eight prompt questions**

Run: `Select-String -Path C:\Users\musta\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-12b-driver-package-test-signing-plan.md -Pattern 'complete installable driver package|CAT catalog|ROOT\\AudioCodec|Audapp Input'`
Expected: matches are returned for all four phrases.

### Task 3: Draft the VM-only test-signing strategy section

**Files:**
- Modify: `C:\Users\musta\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-12b-driver-package-test-signing-plan.md`

- [ ] **Step 1: Add the snapshot-first rule and rollback note before any signing commands**

```markdown
## 3. VM-only test-signing strategy

Before any future signing or installation work:

1. Shut down the VM cleanly.
2. Create a VMware snapshot named `Audapp driver compile green before test signing`.
3. Record the snapshot creation time in the phase report.
4. If the future phase fails, revert to this snapshot before attempting a second signing or install pass.
```

- [ ] **Step 2: Add the future admin-only certificate and test-signing commands as a planning block**

```powershell
# Future phase only. Do not run in Phase 12B.
# Run from an elevated PowerShell session inside the VM.

$certRoot = 'C:\Users\musta\Documents\Audapp\driver-test-signing'
New-Item -ItemType Directory -Force -Path $certRoot | Out-Null

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject 'CN=Audapp Driver Test' `
  -CertStoreLocation 'Cert:\LocalMachine\My' `
  -KeyAlgorithm RSA `
  -KeyLength 4096 `
  -HashAlgorithm SHA256 `
  -NotAfter (Get-Date).AddYears(2)

Export-Certificate -Cert $cert -FilePath "$certRoot\AudappDriverTest.cer" | Out-Null
Export-PfxCertificate -Cert $cert -FilePath "$certRoot\AudappDriverTest.pfx" -Password (Read-Host -AsSecureString 'PFX password') | Out-Null

Import-Certificate -FilePath "$certRoot\AudappDriverTest.cer" -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
Import-Certificate -FilePath "$certRoot\AudappDriverTest.cer" -CertStoreLocation 'Cert:\LocalMachine\TrustedPublisher' | Out-Null

bcdedit /set testsigning on
Restart-Computer
```

Expected for the future phase:
- Certificate material is stored outside the repo.
- The VM runs the next install/sign step elevated.
- Test signing is enabled only after the VM snapshot exists.

- [ ] **Step 3: Add the Secure Boot and signature-verification guidance**

```markdown
### Secure Boot and signing notes

- Test-signing changes must be performed in an elevated VM session.
- If Windows rejects `bcdedit /set testsigning on` because Secure Boot policy is active, disable Secure Boot only inside the VM after the snapshot exists.
- Sign both the catalog and the `.sys` binary in the future phase. The catalog is required for package installation; signing the `.sys` as well makes binary verification explicit during triage.
- Verify signatures with `signtool verify` before any `pnputil` install attempt.
- Undo test signing at the end of the future validation cycle with `bcdedit /set testsigning off`, then reboot and confirm the VM returns to normal boot mode.
```

- [ ] **Step 4: Save the file and verify the section covers enablement, storage, signing targets, verification, and rollback**

Run: `Select-String -Path C:\Users\musta\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-12b-driver-package-test-signing-plan.md -Pattern 'New-SelfSignedCertificate|TrustedPublisher|bcdedit /set testsigning on|bcdedit /set testsigning off|Secure Boot'`
Expected: one match per required topic.

### Task 4: Document catalog generation and staging flow

**Files:**
- Modify: `C:\Users\musta\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-12b-driver-package-test-signing-plan.md`

- [ ] **Step 1: Add the exact WDK tool-path notes discovered in the current environment**

```markdown
## 4. Catalog generation and package staging plan

Verified WDK tool paths in the current environment:

- `C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe`
- `C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\stampinf.exe`
- `C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x86\Inf2Cat.exe`

Note: `Inf2Cat.exe` is not present under the `x64` folder here, so the future phase should call the `x86` binary explicitly.
```

- [ ] **Step 2: Add the future staging and catalog commands**

```powershell
# Future phase only. Do not run in Phase 12B.

$stage = 'C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64'
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Copy-Item 'C:\Users\musta\Audapp\driver\scaffold\audapp-input\project\upstream-audiocodec\x64\Debug\AudioCodec.sys' $stage -Force
Copy-Item 'C:\Users\musta\Audapp\driver\scaffold\audapp-input\project\upstream-audiocodec\x64\Debug\AudioCodec.inf' $stage -Force

# If Phase 12C rewrites the source INF, rerun stampinf during packaging so the staged INF stays current.
& 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\stampinf.exe' `
  -f "$stage\AudioCodec.inf" `
  -a amd64 `
  -d * `
  -c AudioCodec.cat `
  -v * `
  -k 1.31

& 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x86\Inf2Cat.exe' `
  /driver:"$stage" `
  /os:10_VB_X64 `
  /verbose
```

Expected for the future phase:
- The stage folder contains `AudioCodec.sys`, `AudioCodec.inf`, and a generated `AudioCodec.cat`.
- `Inf2Cat.exe` runs against the staged directory rather than the raw build directory.
- The `/os:10_VB_X64` target matches the current Windows 10 build-19045 VM context.

- [ ] **Step 3: Add the future signing and verification commands for the staged files**

```powershell
# Future phase only. Do not run in Phase 12B.

$signTool = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe'
$certThumbprint = (Get-ChildItem Cert:\LocalMachine\My | Where-Object Subject -eq 'CN=Audapp Driver Test' | Select-Object -ExpandProperty Thumbprint -First 1)

& $signTool sign /fd SHA256 /sha1 $certThumbprint /sm /s My "$stage\AudioCodec.sys"
& $signTool sign /fd SHA256 /sha1 $certThumbprint /sm /s My "$stage\AudioCodec.cat"

& $signTool verify /v /kp "$stage\AudioCodec.sys"
& $signTool verify /v /kp /c "$stage\AudioCodec.cat" "$stage\AudioCodec.sys"
```

- [ ] **Step 4: Save the file and verify the section includes the stage folder, WDK paths, Inf2Cat, stampinf, and signtool**

Run: `Select-String -Path C:\Users\musta\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-12b-driver-package-test-signing-plan.md -Pattern 'package\\Debug\\x64|Inf2Cat.exe|stampinf.exe|signtool.exe|10_VB_X64'`
Expected: one match per required term.

### Task 5: Write the future install, uninstall, and risk sections

**Files:**
- Modify: `C:\Users\musta\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-12b-driver-package-test-signing-plan.md`

- [ ] **Step 1: Add the future install and uninstall command plan**

```markdown
## 5. Future install/load test plan

Future execution order:

1. Create the VMware snapshot.
2. Open an elevated PowerShell session in the VM.
3. Enable test signing if required, then reboot.
4. Create and import the test certificate.
5. Stage the package into `driver/scaffold/audapp-input/package/Debug/x64`.
6. Generate the catalog.
7. Sign the `.sys` and `.cat`.
8. Verify both signatures.
9. Install with `pnputil /add-driver $infPath /install`.
10. Inspect Device Manager.
11. Inspect Windows audio endpoints.
12. Inspect the Audapp Devices page.
13. Resolve the published OEM name for the installed INF, then remove it with `pnputil /delete-driver $publishedName /uninstall /force`.
14. Disable test signing if it was enabled and reboot.
```

- [ ] **Step 2: Add the exact future command block for install and rollback**

```powershell
# Future phase only. Do not run in Phase 12B.

$infPath = (Get-ChildItem 'C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64' -Filter *.inf | Select-Object -ExpandProperty FullName -First 1)
$infName = Split-Path $infPath -Leaf

pnputil /add-driver $infPath /install
pnputil /enum-drivers
pnputil /enum-devices /connected /class Media

$enumText = pnputil /enum-drivers | Out-String
$pattern = '(?ms)Published Name\\s*:\\s*(oem\\d+\\.inf).*?Original Name\\s*:\\s*' + [regex]::Escape($infName)
$publishedName = ([regex]::Match($enumText, $pattern)).Groups[1].Value
pnputil /delete-driver $publishedName /uninstall /force

bcdedit /set testsigning off
Restart-Computer
```

- [ ] **Step 3: Add the risk analysis section with the required concerns**

```markdown
## 6. Risk analysis

- BSOD risk: any kernel-mode install can destabilize the VM, so snapshot-before-change is mandatory.
- Boot/test-signing risk: enabling test signing changes boot policy and requires a reboot.
- Secure Boot conflict: Secure Boot can block test-signing mode in the VM.
- Driver store pollution: repeated failed installs can leave stale OEM packages behind.
- Broken or ghost audio devices: root-enumerated sample devices can remain registered after failed tests.
- Incomplete INF risk: the current sample-branded INF may install but still not represent the intended Audapp package.
- Wrong hardware ID risk: `ROOT\AudioCodec` is a sample root ID, not a product-ready Audapp identity.
- Endpoint visibility risk: a successful install does not guarantee Windows audio endpoints appear.
- Product-gap risk: the ACX sample scaffold is not yet the final Audapp virtual endpoint architecture.
- Uninstall risk: removing a misinstalled package may require force deletion and reboot.
- Rollback strategy: prefer VMware snapshot revert over repeated manual cleanup when kernel behavior becomes unclear.
```

- [ ] **Step 4: Add the verification checklist and the Phase 12C recommendation**

```markdown
## 7. Recommended Phase 12C scope

Recommendation: **Option B - Phase 12C Audapp Driver Package Cleanup**

Why this option:

- The current package is still sample-branded as `AudioCodec`.
- The current build flow is compile-only and does not stage a package directory.
- No `.cat` exists yet.
- Cleaning up naming and package structure is safer than signing or installing the sample-branded scaffold.

## 8. Verification checklist

- [ ] Current Git state recorded
- [ ] Current build outputs recorded
- [ ] INF and CAT readiness analyzed
- [ ] Test-signing plan documented without executing it
- [ ] Catalog-generation plan documented without executing it
- [ ] Future install and uninstall flow documented without executing it
- [ ] Risks documented
- [ ] Phase 12C recommendation stated clearly
```

- [ ] **Step 5: Save the file and verify all requested top-level sections exist**

Run: `Select-String -Path C:\Users\musta\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-12b-driver-package-test-signing-plan.md -Pattern '^## 1\.|^## 2\.|^## 3\.|^## 4\.|^## 5\.|^## 6\.|^## 7\.|^## 8\.'`
Expected: exactly eight section matches.

### Task 6: Create the single recommended Phase 12C prompt

**Files:**
- Create: `C:\Users\musta\Audapp\docs\superpowers\prompts\2026-05-30-audapp-phase-12c-driver-package-cleanup-build-prompt.md`

- [ ] **Step 1: Create the prompt file with the Build mode header and scope**

~~~markdown
# Audapp - Phase 12C Driver Package Cleanup Build Prompt

## Target Thread
Audapp - Phase 12C Driver Package Cleanup

## Target Agent
Codex

## Suggested Model / Effort
GPT-5.5 - High/XHigh effort
Alternative: GPT-5.4 - High effort

## Mode
Build mode

## Suggested Skills
- `windows-driver`
- `wdk`
- `driver-signing`
- `windows-audio`
- `acx`
- `git-workflow`

## Project Path
```text
C:\Users\musta\Audapp
```

## Scope

Phase 12B concluded that the current ACX scaffold still uses generic `AudioCodec` package identity, has no staged package directory, and has no generated catalog file. This phase should clean up the package identity and staging flow as `Audapp Input`, while keeping the compile-only driver build green.
~~~

- [ ] **Step 2: Add the hard safety boundaries and the exact build objective**

```markdown
## Hard Safety Boundaries

Do not do any of the following:

- do not install any driver
- do not load any driver
- do not enable test signing
- do not run `bcdedit`
- do not run `pnputil`
- do not run `devcon`
- do not create certificates
- do not sign binaries
- do not change boot configuration
- do not push to remote
- do not make destructive Git changes

## Main Objective

Refactor the current compile-only scaffold so the package identity, file naming, and staging flow are Audapp-specific:

- rename package-facing strings from generic `AudioCodec` sample branding to `Audapp Input`
- preserve compile-only success
- add or document a deterministic package staging directory under `driver\scaffold\audapp-input\package\Debug\x64`
- ensure the staged package contains the future install inputs (`.sys` and `.inf`)
- stop short of catalog signing or installation
```

- [ ] **Step 3: Add the execution tasks, acceptance criteria, and report output**

```markdown
## Tasks

1. Inspect current Git state and scaffold outputs.
2. Audit all package-facing names in the INF, project metadata, and staging flow.
3. Rename the package identity to `Audapp Input` where appropriate without changing the broader scaffold architecture.
4. Keep the compile-only build working:
   - `powershell -ExecutionPolicy Bypass -File .\driver\scaffold\audapp-input\build.ps1`
5. Create a package staging flow under:
   - `driver\scaffold\audapp-input\package\Debug\x64`
6. Copy the compile outputs needed for future packaging into the staging folder.
7. Write a build report at:
   - `C:\Users\musta\Audapp\docs\superpowers\reports\2026-05-30-audapp-phase-12c-driver-package-cleanup-build-report.md`

## Acceptance Criteria

- compile-only build still succeeds
- package-facing names are Audapp-specific
- staged package directory exists
- staged package contains at least the `.sys` and `.inf` artifacts
- no signing, installation, or boot-configuration changes occurred

## Final Response Format

When finished, report:

1. current Git state
2. files changed
3. whether compile-only build passed
4. staged package path
5. whether `.sys` and `.inf` are present there
6. what still blocks signing or installation
7. path to the Phase 12C build report
8. exact next step
```

- [ ] **Step 4: Add the short summary and save the file**

```markdown
## Very Short Summary

This phase converts the current compile-only ACX sample package into an Audapp-specific staged package without signing or installing it.
```

- [ ] **Step 5: Verify the prompt file names Option B explicitly and does not mention installation or signing as actions to perform**

Run: `Select-String -Path C:\Users\musta\Audapp\docs\superpowers\prompts\2026-05-30-audapp-phase-12c-driver-package-cleanup-build-prompt.md -Pattern 'Phase 12C Driver Package Cleanup|do not install any driver|do not sign binaries|compile-only build still succeeds'`
Expected: all four phrases are present.

### Task 7: Perform the plan self-review and checkpoint commit

**Files:**
- Modify: `C:\Users\musta\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-12b-driver-package-test-signing-plan.md`
- Modify: `C:\Users\musta\Audapp\docs\superpowers\prompts\2026-05-30-audapp-phase-12c-driver-package-cleanup-build-prompt.md`

- [ ] **Step 1: Re-read the attached prompt and check each requirement against the spec and prompt files**

Run: `Get-Content -Raw C:\Users\musta\.codex\attachments\b37aaaa8-8d6f-466c-b12e-1f0a8085c848\pasted-text.txt`
Expected: every Task 1 through Task 9 item has a direct home in the created spec or prompt file.

- [ ] **Step 2: Run a placeholder scan across both created docs**

```powershell
Select-String -Path `
  C:\Users\musta\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-12b-driver-package-test-signing-plan.md, `
  C:\Users\musta\Audapp\docs\superpowers\prompts\2026-05-30-audapp-phase-12c-driver-package-cleanup-build-prompt.md `
  -Pattern 'TBD|TODO|implement later|fill in details|appropriate error handling|edge cases|similar to Task'
```

Expected: no matches.

- [ ] **Step 3: Verify the working tree contains only the intended documentation additions**

Run: `git status --short`
Expected: the new or modified paths are limited to `docs/superpowers/specs/`, `docs/superpowers/prompts/`, and optionally `docs/superpowers/plans/`.

- [ ] **Step 4: Commit the documentation artifacts once the review passes**

```bash
git add docs/superpowers/specs/2026-05-30-audapp-phase-12b-driver-package-test-signing-plan.md docs/superpowers/prompts/2026-05-30-audapp-phase-12c-driver-package-cleanup-build-prompt.md docs/superpowers/plans/2026-06-01-audapp-phase-12b-driver-package-test-signing-plan.md
git commit -m "docs(driver): plan phase 12b package and signing prep"
```

- [ ] **Step 5: Hand off execution with the recommended mode**

Plan complete and saved to `docs/superpowers/plans/2026-06-01-audapp-phase-12b-driver-package-test-signing-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints
