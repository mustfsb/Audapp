# Audapp — Phase 12E VM Test Certificate + Catalog Signing Build Prompt

## Target Thread
Audapp — Phase 12E VM Test Certificate + Catalog Signing

## Target Agent
Composer-2.5 or Codex

## Suggested Model / Effort
Composer-2.5 or GPT-5.x — High effort

## Mode
Build mode

## Suggested Skills
- `executing-plans`
- `verification-before-completion`
- `windows-driver`
- `wdk`
- `driver-packaging`
- `debugging`
- `git-workflow`

## Project Name
Audapp

## Project Path
```text
C:\Users\musta\Audapp
```

---

## Prompt

You are working on **Audapp**, a Windows desktop audio control application moving toward real virtual audio driver and routing support.

This task is **Phase 12E: VM-Only Test Certificate + Catalog Signing Preparation**.

Do **not** commit anything unless the user explicitly asks later.

---

# Current State (after Phase 12D)

Phase 12D is complete:

- Compile-only build passes (0 warnings, 0 errors).
- Staged package path:
  ```text
  driver\scaffold\audapp-input\package\Debug\x64
  ```
- Staged artifacts include:
  ```text
  AudioCodec.sys
  AudioCodec.inf
  audiocodec.cat   (Inf2Cat output; INF references AudioCodec.cat)
  package-manifest.txt
  ```
- Staged INF contains `Audapp Input`, `ROOT\AudappInput`, `CatalogFile=AudioCodec.cat`.
- Catalog was generated with:
  ```text
  C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x86\Inf2Cat.exe
  ```
  using `/os:10_VB_X64` and `/uselocaltime`.
- **No signing** has been performed.
- **No install/load/test-signing** has been performed.

---

# Phase 12E Objective

On an **isolated VM snapshot**, create a **VM-only test code-signing certificate**, import it only inside that VM, sign the staged catalog (and optionally the `.sys` for verification), and verify signatures.

This phase prepares a **signed catalog package** for a future install dry run. It does **not** install or load the driver.

---

# VM and Elevation Requirements

**Before any signing work:**

1. Create or revert to a **fresh VM snapshot** (baseline before certificate/signing experiments).
2. Use **elevated (Run as Administrator) PowerShell** for certificate store and signing commands.
3. Document the snapshot name and VM hostname in the Phase 12E report.

---

# Hard Safety Boundaries

Do **not** do any of the following in Phase 12E:

- do not install any driver,
- do not load any driver,
- do not run `pnputil`,
- do not run `devcon`,
- do not enable test signing (`bcdedit`) unless the user explicitly expands scope in a later phase,
- do not modify boot configuration for install tests,
- do not perform routing or product runtime work,
- do not push to remote,
- do not make destructive Git changes,
- do not commit unless the user explicitly asks later.

Certificate and signing are in scope; **driver install is not**.

---

# Staged Package Path

```text
C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64
```

Expected inputs:

```text
AudioCodec.sys
AudioCodec.inf
audiocodec.cat   (or AudioCodec.cat — same file on Windows)
```

---

# Required Work

## 1. Pre-flight checks

From `C:\Users\musta\Audapp`:

```powershell
git status --short
git branch --show-current
Get-ChildItem -Force .\driver\scaffold\audapp-input\package\Debug\x64
```

Confirm catalog exists; if missing, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\driver\scaffold\audapp-input\build.ps1
powershell -ExecutionPolicy Bypass -File .\driver\scaffold\audapp-input\Generate-Catalog.ps1
```

## 2. Create VM-only test certificate

- Create a self-signed code-signing certificate suitable for test signing (e.g. `New-SelfSignedCertificate` with appropriate EKU for code signing).
- Store private key in the VM only; do not export secrets to the host repo.
- Use a distinct subject/CN such as `Audapp VM Test Code Signing` so it is identifiable in certmgr.

## 3. Import certificate (VM only)

- Import into `Cert:\LocalMachine\My` (or documented store) for signing.
- If needed for verification chain on the same VM, import public cert to `Root` / `TrustedPublisher` **only inside the VM** — document exactly what was done.

## 4. Sign the catalog (required)

- Use WDK `signtool.exe` from the verified kit path (same WDK version family as Inf2Cat: `10.0.28000.0`).
- Sign the catalog file in the staged package directory.
- Prefer a repeatable script, e.g. `Sign-Catalog.ps1`, alongside `Generate-Catalog.ps1`.

## 5. Optionally sign `AudioCodec.sys`

- Optional extra verification; catalog signing is the package-critical artifact.
- Document timestamp server usage if used.

## 6. Verify signatures

```powershell
signtool verify /pa /v <path-to-cat>
signtool verify /pa /v <path-to-sys>   # if signed
```

Capture output in the report.

## 7. Documentation

Write report:

```text
docs\superpowers\reports\2026-05-30-audapp-phase-12e-vm-test-certificate-catalog-signing-build-report.md
```

Include: snapshot name, cert subject/thumbprint (not private key), signtool paths, files signed, verification output, and explicit confirmation that install/load/pnputil/devcon/bcdedit were not run.

## 8. Next-phase prompt (optional)

If appropriate, generate Phase 12F prompt for **install dry run** (still VM-only, with test-signing enablement if required by that phase's spec) — but Phase 12E itself must not install.

---

# Tool Paths (this VM baseline)

- Inf2Cat: `C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x86\Inf2Cat.exe`
- Signtool: discover under `C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe` (verify with `where signtool` in elevated dev shell)

---

# Acceptance Criteria

Phase 12E is complete when:

- VM snapshot documented,
- VM-only test certificate created and imported (VM only),
- Staged catalog is signed,
- `signtool verify` succeeds for the catalog,
- Optional `.sys` signing documented if performed,
- Phase 12E report written,
- **No** driver install/load,
- **No** `pnputil` / `devcon`,
- **No** Git commit unless user asks.

---

# Final Response Format

When finished, report:

1. What was implemented.
2. Files changed.
3. Certificate subject/thumbprint (no secrets).
4. Signtool command(s) used.
5. Verification results.
6. Staged package path and signed artifacts.
7. Safety boundary compliance table.
8. Known limitations.
9. Path to Phase 12E report.
10. Current Git status.
11. Exact next step (likely test-signing enablement + install dry run in a later phase).

---

## Very Short Summary

Phase 12E signs the unsigned catalog produced in Phase 12D using a VM-only test certificate. No driver install, no pnputil, no test-signing boot changes unless a later phase explicitly requires them.
