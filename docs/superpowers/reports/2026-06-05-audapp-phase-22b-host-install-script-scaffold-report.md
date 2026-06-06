# Audapp Phase 22B Host-Install Script Scaffold Report

- Date: 2026-06-06 (filed under the 2026-06-05 phase-22 series)
- Phase: 22B
- Workspace: `C:\Users\musta\Audapp`
- Branch: `main`
- Mode: repo changes plus read-only validation only

## 1. Files Created Or Updated

Created:

- `scripts/host-install/Install-AudappHost.ps1`
- `scripts/host-install/Uninstall-AudappHost.ps1`
- `scripts/host-install/Test-AudappHostReadiness.ps1`
- `scripts/host-install/Reset-AudappAudioDefault.ps1`
- `scripts/host-install/README.md`
- `scripts/host-install/.gitignore`
- `docs/superpowers/reports/2026-06-05-audapp-phase-22b-host-install-script-scaffold-report.md`

Updated:

- `scripts/host-install/lib/AudappHostCommon.ps1`
- `.gitignore`

## 2. Safety Gates Implemented

- All mutating scripts default to dry-run with `[switch]$DryRun = $true`.
- Real mutation requires both `-ConfirmHostInstall` and `-DryRun:$false`.
- Real install and uninstall paths require elevation before mutation.
- Install and uninstall flows use `Invoke-AudappCommandSafely` as the only mutation gate.
- Readiness stays read-only and exits non-zero on real-install blockers.
- Reset-default dry-run prints the current default, the physical candidate, and the intended target before any real change.

## 3. Identity Guards Implemented

- `Assert-AudappChannelsInfIdentity` enforces the required `ROOT\AudappGeneral`, `ROOT\AudappMusic`, `ROOT\AudappGame`, `ROOT\AudappBrowser`, `AddService=AudappChannels`, and `CatalogFile=AudappChannels.cat` identities.
- The same guard rejects `ROOT\AudappInput`, `ROOT\AudappMulti`, `Audapp Input`, `Audapp Multi`, `AudioCodec`, and `AudioMulti`.
- `Assert-NotAudappInputOrAudioMulti` blocks protected references, including `oem19.inf`, `oem20.inf`, and `oem21.inf`.
- `Get-AudappChannelsPublishedDrivers` resolves `oemNN.inf` dynamically from `audiochannels.inf` plus provider `Audapp`, instead of hardcoding package names.

## 4. Dry-Run Behavior

- `Install-AudappHost.ps1 -DryRun` prints all planned cert-import, `pnputil`, `devgen`, scan, and default-reset steps without executing them.
- `Uninstall-AudappHost.ps1 -DryRun` prints all planned device-removal, dynamic-package delete, and default-reset steps without executing them.
- `Reset-AudappAudioDefault.ps1 -DryRun` prints the current default and the physical fallback endpoint without changing audio state.
- `Test-AudappHostReadiness.ps1` is read-only and reports blockers such as missing payload and missing `devgen.exe`.

## 5. Install Design Behavior

- Captures the current default render endpoint through the fixed MMDevice helper.
- Resolves a physical non-Audapp fallback endpoint before any planned install action.
- Validates payload identity and reports missing payload files up front.
- Validates and reports Secure Boot and test-signing state, but does not change either one automatically.
- Plans the four exact AudappChannels devnode creations and the driver publish/install sequence.
- Plans a default-output reset back to the captured physical endpoint after install.

## 6. Uninstall Design Behavior

- Enumerates only the four AudappChannels devnodes and the dynamically resolved AudappChannels package.
- Refuses protected package identities through `Assert-ResolvedPackageIsAudappChannels`.
- Plans removal only for the four expected `ROOT\DEVGEN\AUDAPP*0001` device IDs.
- Plans deletion only for the dynamically resolved AudappChannels `oemNN.inf`.
- Plans resetting Windows default output back to a physical endpoint.
- Leaves stale MMDevice cleanup as an explicit no-op warning in 22B because safe proof is still deferred.

## 7. Reset-Default Design Behavior

- Finds the current default render endpoint and a physical non-Audapp candidate.
- Supports an explicit endpoint id only if it resolves to a physical non-Audapp render endpoint.
- Uses the same dual-confirmation gate before any real `IPolicyConfig` default-endpoint change.

## 8. README Summary

The README now documents:

- what each script does
- what the scripts do not do
- the host readiness checklist
- the Secure Boot and test-signing warning
- dry-run and future real-mode commands
- rollback and emergency boot-failure guidance
- required payload staging
- why `Audapp Input` is intentionally excluded from the host install

## 9. Validation Commands Run

Executed:

```powershell
git branch --show-current
git status --short

$files = Get-ChildItem .\scripts\host-install -Recurse -Filter *.ps1
foreach ($file in $files) {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count -gt 0) { $errors; exit 1 }
}

# non-ASCII scan for scripts/host-install/*.ps1

.\scripts\host-install\Test-AudappHostReadiness.ps1
.\scripts\host-install\Install-AudappHost.ps1 -DryRun
.\scripts\host-install\Uninstall-AudappHost.ps1 -DryRun
.\scripts\host-install\Reset-AudappAudioDefault.ps1 -DryRun
```

Results:

- Parse checks: PASS for all `scripts/host-install/*.ps1` files.
- Non-ASCII scan: PASS for all `scripts/host-install/*.ps1` files.
- `Get-AudappChannelsPublishedDrivers`: PASS after fixing StrictMode-safe count handling; current host resolves `oem22.inf`.
- `Get-CurrentDefaultRenderEndpoint`: PASS after replacing the broken COM creation path; current host returns `Hoparlor (Audapp General)` with MMDevice id `{0.0.0.00000000}.{76ce6706-7dd2-4795-81fb-b783e0b2e7cc}`.
- `Test-AudappHostReadiness.ps1`: expected BLOCKED result with 2 blockers because `scripts/host-install/payload/` is not staged and `scripts/host-install/bin/devgen.exe` is missing.
- `Install-AudappHost.ps1 -DryRun`: PASS as a dry-run scaffold; printed the full planned command sequence and reported 5 blockers due missing staged payload plus missing `devgen.exe`.
- `Uninstall-AudappHost.ps1 -DryRun`: PASS as a dry-run scaffold; resolved the live AudappChannels package and printed only safe planned removal commands.
- `Reset-AudappAudioDefault.ps1 -DryRun`: PASS as a dry-run scaffold; reported the current default and the physical fallback endpoint without changing audio state.

## 10. Proof No Mutating Commands Were Run

- No real-mode script invocation was executed.
- No `pnputil /add-driver`, `pnputil /delete-driver`, `pnputil /remove-device`, `devgen /add`, `devgen /remove`, `bcdedit /set`, `devcon install`, or `devcon remove` command was run by this session.
- No certificate import, no default-audio change, and no boot-configuration change was executed.
- All host-install script executions used read-only mode or `-DryRun`.

## 11. Known Limitations

- `scripts/host-install/payload/` is intentionally unstaged in this repo state, so readiness and install dry-run report missing payload blockers.
- `scripts/host-install/bin/devgen.exe` is not bundled yet, so readiness and install dry-run report a missing-tool blocker.
- The stale MMDevice cleanup path is still intentionally deferred to a later proof phase.
- README and script outputs reflect the current live host state, where the default render endpoint is still `Audapp General`.

## 12. Exact Next-Phase Recommendation

Proceed to Phase 22C only after staging:

1. `AudioChannels.inf`
2. `AudappChannels.sys`
3. `AudappChannels.cat`
4. `AudappChannels.cer`
5. `bin/devgen.exe`

Then run the same scripts from a clean VM snapshot, verify reboot persistence, verify clean uninstall, and keep 22E host install gated until that VM proof passes.
