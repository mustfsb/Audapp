# Audapp Phase 12C Driver Package Cleanup — Build Report

**Date:** 2026-06-02  
**Agent:** Composer-2.5  
**Workspace:** `C:\Users\musta\Audapp`  
**Branch:** `main` (no commit created per user request)

## Objective

Package-facing identity cleanup and deterministic staging for the ACX compile-only scaffold toward **Audapp Input**, without install, load, signing, or test-signing actions.

## Pre-change snapshot

- `git branch`: `main`
- Staged docs under `docs/superpowers/` were already present (left untouched).
- Raw build outputs existed under `project/upstream-audiocodec/x64/Debug/`.
- No `package/Debug/x64` staging folder existed.

## Implementation summary

1. **Package identity patch** — Added `driver/scaffold/audapp-input/Apply-PackageIdentity.ps1` to rewrite package-facing INF strings after upstream import:
   - Provider / manufacturer / disk / device description → Audapp / Audapp Input
   - Speaker and microphone friendly names → Audapp Input Speaker / Microphone
   - Hardware ID in INF models section → `ROOT\AudappInput` (was `ROOT\AudioCodec`)
   - Internal service name, binary name (`AudioCodec.sys`), and catalog file reference left as upstream sample identifiers to preserve compile-only ACX scaffold compatibility.

2. **Prepare integration** — `prepare.ps1` invokes `Apply-PackageIdentity.ps1` after copying upstream sample files.

3. **Build + staging** — `build.ps1` applies package identity before MSBuild, then copies stamped `AudioCodec.sys` and `AudioCodec.inf` into:
   ```text
   driver\scaffold\audapp-input\package\Debug\x64
   ```
   A `package-manifest.txt` records configuration, hardware ID, and artifact list.

4. **Documentation** — Updated `BUILD.md` and added `package/README.md`.

## Verification

**Command:**

```powershell
powershell -ExecutionPolicy Bypass -File .\driver\scaffold\audapp-input\build.ps1
```

**Result:** Success — 0 warnings, 0 errors (build duration ~12s on 2026-06-02).

**Staged path verified:**

```text
C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64
```

**Staged artifacts:**

| File | Present |
|------|---------|
| `AudioCodec.sys` | Yes (105,472 bytes) |
| `AudioCodec.inf` | Yes (4,239 bytes; contains `Audapp Input`, `ROOT\AudappInput`) |
| `package-manifest.txt` | Yes (helper metadata) |
| `*.cat` | No (out of scope) |

**Sample staged INF strings:**

- `AudioCodec.DeviceDesc = "Audapp Input"`
- `StdMfg = "Audapp"`
- `ROOT\AudappInput` in manufacturer models section

## Safety boundary compliance

| Action | Performed |
|--------|-----------|
| Driver install | No |
| Driver load | No |
| Test signing / `bcdedit` | No |
| `pnputil` / `devcon` | No |
| Certificate creation | No |
| Binary/catalog signing | No |
| Git commit | No |
| Remote push | No |

## Files changed (tracked)

- `driver/scaffold/audapp-input/Apply-PackageIdentity.ps1` (new)
- `driver/scaffold/audapp-input/build.ps1`
- `driver/scaffold/audapp-input/prepare.ps1`
- `driver/scaffold/audapp-input/BUILD.md`
- `driver/scaffold/audapp-input/package/README.md` (new)
- `docs/superpowers/reports/2026-05-30-audapp-phase-12c-driver-package-cleanup-build-report.md` (this file)

Gitignored build outputs under `project/` and `package/Debug/x64/*.{sys,inf}` were updated on disk but are not committed artifacts.

## Known limitations

- Project/binary filenames remain `AudioCodec.*` (upstream ACX sample naming); only package-facing metadata and staged layout were Audapp-specific in this phase.
- `CatalogFile=AudioCodec.cat` remains in the INF; no catalog was generated or signed.
- `ROOT\AudappInput` is not validated against runtime root-enumeration or install behavior until a future VM phase.
- Re-running `prepare.ps1` re-imports upstream INF and re-applies the identity patch; direct edits to `project/upstream-audiocodec/AudioCodec.inf` alone are not durable across prepare.

## Git status after work

```
 M driver/scaffold/audapp-input/BUILD.md
 M driver/scaffold/audapp-input/build.ps1
 M driver/scaffold/audapp-input/prepare.ps1
?? driver/scaffold/audapp-input/Apply-PackageIdentity.ps1
?? driver/scaffold/audapp-input/package/
```

Pre-existing staged docs under `docs/superpowers/` unchanged by this phase.

## Exact next step

**Phase 12D (or next signing phase):** On an isolated VM snapshot, run `stampinf` + `Inf2Cat` against `package\Debug\x64`, sign the catalog with a VM-only test certificate, then attempt controlled `pnputil` install — per Phase 12B spec. Do not install until catalog and test-signing prep are complete.
