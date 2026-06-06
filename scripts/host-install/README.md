# Audapp Host-Install Scripts

## What These Scripts Do

These scripts scaffold the host install flow for the AudappChannels-only path:

- `Test-AudappHostReadiness.ps1` reports host readiness with read-only checks.
- `Install-AudappHost.ps1` plans or performs the AudappChannels install flow.
- `Uninstall-AudappHost.ps1` plans or performs the AudappChannels uninstall flow.
- `Reset-AudappAudioDefault.ps1` plans or performs a default-output reset to a physical non-Audapp endpoint.
- `lib/AudappHostCommon.ps1` contains shared logging, identity guards, endpoint discovery, and dynamic OEM resolution helpers.

## What These Scripts Do Not Do

- They do not install `Audapp Input`.
- They do not install or remove `AudioMulti`.
- They do not hardcode `oemNN.inf`.
- They do not enable test-signing automatically.
- They do not change Secure Boot.
- They do not mutate driver, boot, or default-audio state unless both `-ConfirmHostInstall` and `-DryRun:$false` are supplied.

## Host Readiness Checklist

Before any real host install:

1. Run an elevated PowerShell session.
2. Confirm Secure Boot is OFF.
3. Confirm Windows test-signing is ON.
4. Save the BitLocker recovery key if BitLocker is enabled.
5. Create a System Restore point if available.
6. Confirm a physical non-Audapp output device is present and working.
7. Stage the signed payload files under `scripts/host-install/payload/`.
8. Stage `devgen.exe` under `scripts/host-install/bin/`.
9. Review the readiness report for blockers and warnings.

## Secure Boot And Test-Signing Warning

The current host-install path assumes a test-signed AudappChannels driver.
That requires Secure Boot OFF and Windows test-signing ON. The scripts report
those states but do not change firmware or boot configuration automatically.

## Dry-Run Readiness

```powershell
.\scripts\host-install\Test-AudappHostReadiness.ps1
```

The readiness script is read-only. It exits non-zero when real-install blockers
are present, but it still prints a useful report and writes a log file.

## Install Later

Dry-run:

```powershell
.\scripts\host-install\Install-AudappHost.ps1 -DryRun
```

Real mode, only after Phase 22C and 22D are complete:

```powershell
.\scripts\host-install\Install-AudappHost.ps1 -ConfirmHostInstall -DryRun:$false
```

## Uninstall Later

Dry-run:

```powershell
.\scripts\host-install\Uninstall-AudappHost.ps1 -DryRun
```

Real mode:

```powershell
.\scripts\host-install\Uninstall-AudappHost.ps1 -ConfirmHostInstall -DryRun:$false
```

## Reset Audio Default

Dry-run:

```powershell
.\scripts\host-install\Reset-AudappAudioDefault.ps1 -DryRun
```

Real mode:

```powershell
.\scripts\host-install\Reset-AudappAudioDefault.ps1 -ConfirmHostInstall -DryRun:$false
```

## Rollback Steps

1. Run `Reset-AudappAudioDefault.ps1` to move the default output back to a physical endpoint.
2. Stop the Audapp app.
3. Run `Uninstall-AudappHost.ps1 -ConfirmHostInstall -DryRun:$false`.
4. Reboot.
5. If devices linger, remove only the four AudappChannels devnodes.
6. If audio is still broken, use System Restore.
7. Disable test-signing only after the AudappChannels package is removed.

## Emergency Boot Failure Summary

- Prefer WinRE System Restore first.
- Safe Mode can be used to remove the AudappChannels package and devnodes.
- Offline driver removal through `dism /image:C:\ /remove-driver` is the last-resort path.
- Keep the BitLocker recovery key available before any real host install.

## Payload Files To Stage

Place these files under `scripts/host-install/payload/` before real install:

- `AudioChannels.inf`
- `AudappChannels.sys`
- `AudappChannels.cat`
- `AudappChannels.cer`

Place `devgen.exe` under `scripts/host-install/bin/`.

## Why Audapp Input Is Not Installed On Host

The current app runtime only depends on the four Audapp render channels:
General, Music, Game, and Browser. `Audapp Input` is a legacy capture path and
is intentionally excluded from the host install to reduce risk and avoid
touching the live capture device path.
