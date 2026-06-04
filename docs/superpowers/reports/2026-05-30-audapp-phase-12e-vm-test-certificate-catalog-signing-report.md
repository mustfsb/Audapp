# Audapp Phase 12E VM Test Certificate + Catalog Signing — Report

**Date:** 2026-06-02  
**Agent:** Composer-2.5  
**Workspace:** `C:\Users\musta\Audapp`  
**Branch:** `main` (no commit created per user request)  
**VM hostname:** `DESKTOP-6CK0ST4`

## VM snapshot

The user reported a VMware snapshot was taken after Phase 12D (unsigned catalog baseline). Phase 12E signing was performed on that VM after revert/use of that snapshot. Snapshot name was not recorded in-repo; recommend naming future snapshots e.g. `Audapp 12E signed catalog before install dry run`.

## Objective

Create a VM-only test code-signing certificate, sign the staged driver catalog (and optionally `.sys`), verify signatures, and produce a signed package candidate — **without** driver install, load, test-signing boot changes, or `pnputil`/`devcon`.

## Pre-flight

```text
branch: main
staged package: driver\scaffold\audapp-input\package\Debug\x64
```

| Artifact | Pre-sign size | Post-sign size |
|----------|---------------|----------------|
| `AudioCodec.sys` | 105,472 | 107,680 |
| `AudioCodec.inf` | 4,241 | 4,241 |
| `audiocodec.cat` | 1,128 | 3,199 |
| `package-manifest.txt` | 429 | 647 |

INF identity confirmed:

- `Audapp Input`
- `ROOT\AudappInput`
- `CatalogFile=AudioCodec.cat`

## Implementation

1. **`Sign-Catalog.ps1`** — New script under `driver/scaffold/audapp-input/` that:
   - Requires elevated PowerShell (`LocalMachine` stores, `signtool /sm`)
   - Creates or reuses self-signed code-signing cert `CN=Audapp VM Test Code Signing`
   - Exports public cert to `%USERPROFILE%\Documents\Audapp\driver-test-signing\AudappDriverTest.cer`
   - Imports public cert to `LocalMachine\Root` and `LocalMachine\TrustedPublisher` (VM only)
   - Signs staged `*.cat` via WDK `signtool.exe`
   - Optional `-SignSys` for `AudioCodec.sys`
   - Runs `signtool verify /pa /v` on signed outputs
   - Appends signing notes to `package-manifest.txt`

2. **Documentation** — Updated `BUILD.md` and `package/README.md` with signing steps.

3. **Phase 12F prompt** — Generated install dry-run build prompt (not executed).

## Certificate

| Field | Value |
|-------|--------|
| Subject | `CN=Audapp VM Test Code Signing` |
| Thumbprint (SHA1) | `C9C96275386BCDA269FE344FE805C4D668C52F86` |
| Expires | 2028-06-02 |
| Private key store | `Cert:\LocalMachine\My` |
| Public export | `C:\Users\musta\Documents\Audapp\driver-test-signing\AudappDriverTest.cer` |

No PFX or private key material was written to the git repo.

## Signtool

**Path:** `C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe`

**Catalog signed:** `C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64\audiocodec.cat`

Effective commands (via `Sign-Catalog.ps1 -SignSys`):

```text
signtool sign /fd SHA256 /sha1 C9C96275386BCDA269FE344FE805C4D668C52F86 /sm /s My /v <catalog>
signtool sign /fd SHA256 /sha1 C9C96275386BCDA269FE344FE805C4D668C52F86 /sm /s My /v <AudioCodec.sys>
signtool verify /pa /v <catalog>
signtool verify /pa /v <AudioCodec.sys>
```

No timestamp server was used (files are not timestamped).

## Verification results

### Catalog (`audiocodec.cat`)

```text
Successfully verified: ...\audiocodec.cat
Number of files successfully Verified: 1
Number of warnings: 0
Number of errors: 0
Signing Certificate Chain: Audapp VM Test Code Signing (self-signed)
```

### Driver binary (`AudioCodec.sys`) — optional signing performed

```text
Successfully verified: ...\AudioCodec.sys
Number of files successfully Verified: 1
Number of warnings: 0
Number of errors: 0
```

## Safety boundary compliance

| Action | Performed |
|--------|-----------|
| Driver install | No |
| Driver load | No |
| Test signing / `bcdedit` | No |
| `pnputil` / `devcon` | No |
| Git commit | No |
| Remote push | No |
| Certificate in repo | No (public `.cer` outside repo only) |

## Files changed

- `driver/scaffold/audapp-input/Sign-Catalog.ps1` (new)
- `driver/scaffold/audapp-input/BUILD.md`
- `driver/scaffold/audapp-input/package/README.md`
- `docs/superpowers/reports/2026-05-30-audapp-phase-12e-vm-test-certificate-catalog-signing-report.md` (this file)
- `docs/superpowers/prompts/2026-05-30-audapp-phase-12f-vm-driver-install-dry-run-build-prompt.md` (new)

On-disk staged outputs under `package/Debug/x64/` updated (signed catalog/SYS; not committed).

## Known limitations

- Catalog on disk is `audiocodec.cat` (lowercase); INF references `AudioCodec.cat` (case-insensitive on Windows).
- Signatures are not timestamped; clock rollback could affect trust displays.
- Self-signed VM cert is not suitable for production or host machines.
- Install on Windows typically still requires test-signing mode and/or proper trust policy even with a signed catalog — Phase 12F addresses install dry run only.
- Re-running `Generate-Catalog.ps1` after signing will replace the catalog and require re-signing.
- Non-elevated shells cannot run `Sign-Catalog.ps1` (by design).

## Git status after work

See `git status --short` in workspace; no commit created.

## Exact next step

**Phase 12F:** On a fresh VM snapshot after signed package verification, run the install dry-run prompt — may include enabling test signing if required by that phase, and controlled `pnputil` add (still no routing/product work). See:

`docs/superpowers/prompts/2026-05-30-audapp-phase-12f-vm-driver-install-dry-run-build-prompt.md`
