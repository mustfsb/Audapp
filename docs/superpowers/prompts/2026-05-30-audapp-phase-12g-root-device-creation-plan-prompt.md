# Audapp — Phase 12G Root Device Creation Plan Build Prompt

## Target Thread
Audapp — Phase 12G Root Device Creation Plan

## Target Agent
Composer-2.5 or Codex

## Suggested Model / Effort
Composer-2.5 or GPT-5.x — High effort

## Mode
Plan / Build mode (VM-only execution after plan approval)

## Suggested Skills
- `executing-plans`
- `verification-before-completion`
- `windows-driver`
- `wdk`
- `driver-install`
- `debugging`
- `rollback-planning`
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

This task is **Phase 12G: Root Device Creation Plan** (VM-only).

Phase 12F proved the signed Audapp Input package can enter the Windows driver store. It did **not** create a `ROOT\AudappInput` device instance. Phase 12G plans and then (in a follow-on build prompt if split) performs **one controlled** root device creation — without duplicate root devices.

Do **not** commit unless the user explicitly asks later.

---

# Current State (after Phase 12F)

## Driver store (VM `DESKTOP-6CK0ST4`)

| Field | Value |
|-------|--------|
| Published package | **`oem9.inf`** |
| Original INF | `audiocodec.inf` |
| Provider | Audapp |
| Class | Media (`{4d36e96c-e325-11ce-bfc1-08002be10318}`) |
| Signer | Audapp VM Test Code Signing |
| Hardware ID in INF | `ROOT\AudappInput` |

## Install command that succeeded (12F)

```powershell
pnputil /add-driver "C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64\AudioCodec.inf" /install
```

## What did **not** happen in 12F

- No `ROOT\AudappInput` PnP device instance
- No Audapp-related `Get-PnpDevice` entries
- No new Windows audio endpoint observed
- **devcon was not used**

## Environment

- Test-signing: **Yes** (already on; watermark may be visible)
- VM test cert thumbprint: `C9C96275386BCDA269FE344FE805C4D668C52F86`
- Staged package path unchanged:
  ```text
  C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64
  ```

## Required reading

```text
docs/superpowers/reports/2026-05-30-audapp-phase-12f-vm-driver-install-dry-run-report.md
docs/superpowers/reports/2026-05-30-audapp-phase-12e-vm-test-certificate-catalog-signing-report.md
driver/scaffold/audapp-input/package/Debug/x64/AudioCodec.inf
```

---

# Phase 12G Objective

1. **Plan** how to create exactly **one** `ROOT\AudappInput` device instance bound to the already-published **`oem9.inf`** driver package.
2. Document risks, rollback, and verification commands **before** any destructive or device-creating action.
3. If the plan scope includes execution in the same phase, perform **at most one** root device creation attempt after:
   - elevated admin session,
   - confirming `oem9.inf` is present (`pnputil /enum-drivers`),
   - confirming **no existing** `ROOT\AudappInput` instance (`pnputil /enum-devices /instanceid ROOT\AudappInput*`),
   - fresh VMware snapshot (recommended).

Answer:

- Which tool/method creates the root device (`devcon install`, `pnputil` device creation if applicable on this Windows build, or other documented approach)?
- Exact command lines with real INF/hardware IDs (no placeholders in execution docs).
- How to detect success vs duplicate instances.
- Whether the compile-only ACX sample is expected to register audio endpoints after device creation.
- Rollback: snapshot vs `pnputil /remove-device` vs `pnputil /delete-driver oem9.inf`.

---

# Hard Safety Boundaries

- **VM only** — never on host.
- **No** Audapp routing or app source changes.
- **No** repeated root device creation — check for existing instance first; abort if one exists.
- **No** blind `devcon` retries or mass `ROOT\` experiments.
- **No** deleting unrelated `oem*.inf` packages.
- Prefer snapshot revert for rollback when unsure.
- Document every system-changing command.

---

# Suggested planning checklist

1. Snapshot name and time before device creation.
2. Preflight:
   ```powershell
   pnputil /enum-drivers | findstr /i oem9
   pnputil /enum-devices /instanceid ROOT\AudappInput*
   ```
3. Evaluate options (document pros/cons):
   - WDK `devcon install <inf> ROOT\AudappInput` (only if devcon is available in VM WDK path)
   - Alternative Windows 10/11 APIs or `pnputil` subcommands supported on this build
4. Single creation attempt with full output capture.
5. Post-create verification:
   ```powershell
   pnputil /enum-devices /instanceid ROOT\AudappInput* /drivers
   Get-PnpDevice | Where-Object { $_.InstanceId -like 'ROOT\AudappInput*' }
   pnputil /enum-devices /class Media
   ```
6. Device Manager / Sound settings manual steps if automation insufficient.
7. If device exists: optional **Phase 12H** prompt for endpoint visibility + Audapp Devices page test.

---

# Deliverables

1. **Plan report** (if planning-only) or **build report** (if executed):
   ```text
   docs/superpowers/reports/2026-05-30-audapp-phase-12g-root-device-creation-plan-report.md
   ```
   or
   ```text
   docs/superpowers/reports/2026-05-30-audapp-phase-12g-root-device-creation-build-report.md
   ```

2. If device creation succeeds and endpoints may exist, generate:
   ```text
   docs/superpowers/prompts/2026-05-30-audapp-phase-12h-endpoint-visibility-verification-build-prompt.md
   ```

---

# Acceptance Criteria

- Plan documents exact commands, preflight checks, and rollback.
- No duplicate `ROOT\AudappInput` devices without explicit documentation.
- Phase 12F driver store outcome (`oem9.inf`) is preserved or rollback is documented.
- No Audapp app/routing changes.
- No Git commit unless user asks.

---

# Final Response Format

Report: plan summary, recommended command, risks, rollback path, whether execution was performed, device instance ID if created, report path, Git status, exact next step.

---

## Very Short Summary

Phase 12G plans (and optionally performs) a single controlled creation of `ROOT\AudappInput` after Phase 12F staged `oem9.inf` without duplicates or app changes.
