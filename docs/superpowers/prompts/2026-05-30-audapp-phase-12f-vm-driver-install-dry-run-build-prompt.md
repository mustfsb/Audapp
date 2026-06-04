# Audapp — Phase 12F VM Driver Install Dry Run Build Prompt

## Target Thread
Audapp — Phase 12F VM Driver Install Dry Run

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

This task is **Phase 12F: VM Driver Install Dry Run** (controlled install validation only).

Do **not** commit anything unless the user explicitly asks later.

Take a **new VMware snapshot** after Phase 12E before any install or boot-policy changes.

---

# Current State (after Phase 12E)

Phase 12E is complete:

- Staged signed package path:
  ```text
  C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64
  ```
- Artifacts:
  ```text
  AudioCodec.sys          (signed in 12E with -SignSys)
  AudioCodec.inf
  audiocodec.cat          (signed; INF references AudioCodec.cat)
  package-manifest.txt
  ```
- VM test certificate:
  - Subject: `CN=Audapp VM Test Code Signing`
  - Thumbprint: `C9C96275386BCDA269FE344FE805C4D668C52F86`
  - Public cert: `C:\Users\musta\Documents\Audapp\driver-test-signing\AudappDriverTest.cer`
- `signtool verify /pa /v` succeeded for catalog and SYS.
- **No** driver install, load, `pnputil`, `devcon`, or `bcdedit` was run in Phase 12E.

---

# Phase 12F Objective

On an isolated VM snapshot, perform a **controlled driver package install dry run** to validate that the signed Audapp Input package can be added to the driver store and enumerated — with explicit rollback via snapshot.

This phase may enable **test signing** if required for the self-signed catalog chain. Document every system-changing command.

This phase must **not** perform Audapp routing, product runtime, or app source changes.

---

# Hard Safety Boundaries

- Work only on a throwaway VM with snapshot revert available.
- Document snapshot name before and after install attempts.
- Do not push to remote or commit unless the user explicitly asks.
- Do not modify Audapp application source.
- Do not perform audio routing integration.
- Prefer `pnputil /add-driver` over legacy `devcon` unless the plan documents a reason.
- Do not leave test signing enabled without documenting how to revert (`bcdedit /set testsigning off` + reboot, or snapshot revert).
- If install fails, stop and report — do not loop destructive retries without a new snapshot.

---

# Staged Package Path

```text
C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64
```

Pre-flight from repo root:

```powershell
git status --short
git branch --show-current
Get-ChildItem -Force .\driver\scaffold\audapp-input\package\Debug\x64
& "C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe" verify /pa /v .\driver\scaffold\audapp-input\package\Debug\x64\audiocodec.cat
```

---

# Required Work (outline)

1. **Snapshot** — User or agent documents VMware snapshot taken after Phase 12E signed package.
2. **Test signing (if needed)** — If install requires it, run elevated `bcdedit /set testsigning on`, reboot, document. Check Secure Boot policy on the VM.
3. **Trust** — Confirm `Audapp VM Test Code Signing` is in `LocalMachine\Root` / `TrustedPublisher` (Phase 12E should have done this).
4. **Install dry run** — Example (adjust flags per WDK/docs):
   ```powershell
   pnputil /add-driver "C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64\AudioCodec.inf" /install
   ```
   Capture full `pnputil` output. If `/install` is too aggressive for first pass, use `/add-driver` without immediate device install and document.
5. **Verification** — `pnputil /enum-drivers`, Device Manager or `Get-PnpDevice` for `ROOT\AudappInput` / Audapp Input strings.
6. **Optional unload** — Document removal steps (`pnputil /delete-driver` etc.) if in scope; prefer snapshot revert for cleanup.
7. **Report** — Write:
   ```text
   docs\superpowers\reports\2026-05-30-audapp-phase-12f-vm-driver-install-dry-run-build-report.md
   ```
8. **Next prompt** — If appropriate, generate Phase 12G prompt for driver load/runtime smoke (still VM-only).

---

# Acceptance Criteria

- Snapshot documented.
- Signed package verified before install.
- Install attempt documented with command output.
- No Audapp app/routing changes.
- Phase 12F report written.
- No Git commit unless user asks.

---

# Final Response Format

When finished, report: what was run, install outcome, test-signing state, rollback path, report path, Git status, and exact next step.

---

## Very Short Summary

Phase 12F installs the signed Audapp Input driver package on a VM snapshot for validation. It may enable test signing and use `pnputil`. It does not touch Audapp routing or app source.
