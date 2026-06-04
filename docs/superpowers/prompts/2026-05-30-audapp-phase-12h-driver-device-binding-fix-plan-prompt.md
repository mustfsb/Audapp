# Audapp — Phase 12H Driver/Device Binding Fix Plan Build Prompt

## Target Thread
Audapp — Phase 12H Driver/Device Binding Fix

## Target Agent
Composer-2.5 or Codex

## Suggested Model / Effort
Composer-2.5 — High effort

## Mode
Plan mode (VM-only execution after plan approval)

## Suggested Skills
- `executing-plans`
- `verification-before-completion`
- `windows-driver`
- `wdk`
- `driver-install`
- `root-enumerated-device`
- `devgen`
- `devcon`
- `pnputil`
- `powershell`
- `debugging`
- `rollback-planning`

## Project Name
Audapp

## Project Path
```text
C:\Users\musta\Audapp
```

---

## Prompt

You are working on **Audapp**. Phase **12G** created a root DEVGEN node but **did not bind** the published driver package **`oem9.inf`**.

Do **not** commit unless the user explicitly asks.

---

# Current State (after Phase 12G)

## Driver store

| Field | Value |
|-------|--------|
| Published package | **`oem9.inf`** |
| Original INF | `audiocodec.inf` |
| Provider | Audapp |
| Class | Media |
| Hardware ID in INF | `ROOT\AudappInput` |

## Device instance (12G)

| Field | Value |
|-------|--------|
| Instance ID | **`ROOT\DEVGEN\AUDAPP12G0001`** |
| Hardware ID | `ROOT\AudappInput` |
| Compatible IDs | `ROOT\DevGenDevice`, `DevGenDevice` |
| PnP status | OK, problem code 0 |
| Driver service | **None** |
| Media class | **No** |
| Bound INF | **Not `oem9.inf`** |
| Audio endpoint | **None** |

## What 12G did

- Single `devgen.exe` call (success exit 0)
- **No** `devcon install`
- **No** `pnputil /add-driver` (package already in store)
- **No** endpoint exposure fixes

## Required reading

```text
docs/superpowers/reports/2026-05-30-audapp-phase-12g-root-device-creation-build-report.md
docs/superpowers/reports/2026-05-30-audapp-phase-12f-vm-driver-install-dry-run-report.md
driver/scaffold/audapp-input/package/Debug/x64/AudioCodec.inf
```

---

# Phase 12H Objective

**Plan only** (unless user splits execution) how to get **`oem9.inf`** bound to the existing or replacement `ROOT\AudappInput` hardware ID **without**:

- duplicate root devices,
- blind `devgen` retries,
- deleting unrelated `oem*.inf` packages,
- app/routing changes.

Deliver:

1. Root-cause analysis: why DEVGEN node has `ROOT\AudappInput` HWID but no driver install.
2. Compare safe options (e.g. `devcon install` with staged INF, `pnputil` update-driver, remove DEVGEN node then one controlled install, etc.) for **this Windows build**.
3. Exact preflight commands (enumerate `ROOT\DEVGEN\AUDAPP12G0001`, `ROOT\AudappInput*`, driver store).
4. **Single** recommended execution sequence with full command lines (no placeholders).
5. Success criteria: Media class, `AudioCodec` service, driver INF path, optional endpoint check.
6. Rollback: snapshot first; `pnputil /remove-device "ROOT\DEVGEN\AUDAPP12G0001"`; avoid `delete-driver` unless uninstalling Audapp package intentionally.

---

# Hard Safety Boundaries

- **VM only**, elevated admin.
- Fresh VMware snapshot before any mutation.
- **No** second `devgen` without removing/analyzing existing `ROOT\DEVGEN\AUDAPP12G0001`.
- **No** repeated root creation experiments.
- **No** unrelated driver store cleanup.

---

# Deliverables

1. Plan report:
   ```text
   docs/superpowers/reports/2026-05-30-audapp-phase-12h-driver-device-binding-fix-plan-report.md
   ```

2. If plan concludes binding will succeed but endpoints may still be missing, note follow-on:
   ```text
   docs/superpowers/prompts/2026-05-30-audapp-phase-12h-endpoint-exposure-fix-plan-prompt.md
   ```
   (generate only when appropriate after binding plan is written)

---

# Acceptance Criteria

- Explains 12G DEVGEN vs `oem9.inf` mismatch with evidence.
- One recommended binding path with rollback.
- No commits unless user asks.

---

## Very Short Summary

Phase 12H plans how to bind the staged **`oem9.inf`** driver to the **`ROOT\AudappInput`** hardware ID after 12G left an unbound **`ROOT\DEVGEN\AUDAPP12G0001`** node.
