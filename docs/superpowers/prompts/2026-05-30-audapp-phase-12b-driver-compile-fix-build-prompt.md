# Audapp — Phase 12B Driver Compile-Fix Build Prompt

## Target Thread
Audapp — Phase 12B Driver Compile-Fix Build

## Target Agent
Codex

## Suggested Model / Effort
GPT-5.4 — High effort  
Alternative: GPT-5.5 — High/XHigh effort

## Mode
Build mode

## Project Path
```text
C:\Users\musta\Audapp
```

## Context

Phase 12A confirmed that the Audapp repo already contains a real **ACX-based compile-only driver scaffold** under:

```text
driver\scaffold\audapp-input
```

It also confirmed:

- app-side baseline builds pass,
- the upstream Microsoft sample checkout was cloned to:
  ```text
  C:\Users\musta\toolchains\Windows-driver-samples
  ```
- `prepare.ps1` can import the upstream AudioCodec sample snapshot,
- the compile-only build currently fails before compilation because **WDK build tools are missing**.

The first meaningful failure from Phase 12A was:

```text
Windows Kits build tools were not found at C:\Program Files (x86)\Windows Kits\10\build
```

The previous verification report is here:

```text
C:\Users\musta\Audapp\docs\superpowers\reports\2026-05-30-audapp-phase-12a-vm-driver-toolchain-verification.md
```

## Main Objective

Fix the environment and compile-only build path until the Audapp driver scaffold either:

1. builds successfully in compile-only mode, or
2. fails with a true project/source/configuration error beyond missing WDK tooling.

This phase is still **compile-only only**.

## Hard Safety Boundaries

Do not do any of the following:

- do not install any driver into Windows,
- do not load any driver,
- do not enable test signing,
- do not run `bcdedit`,
- do not disable Secure Boot,
- do not use `pnputil` to install a driver,
- do not create/start a driver service,
- do not modify boot configuration,
- do not push Git changes,
- do not do destructive Git resets.

## Required Starting Assumptions

- Current workspace may be on `main`; do not discard user changes.
- Use the existing scaffold; do not replace it with a new architecture.
- Prefer official Microsoft SDK/WDK / Visual Studio tooling only.
- If elevation is required for tool installation, use the safest path available and document exactly what happened.

## Task 1 — Re-verify Current Toolchain

Re-check:

```powershell
git status
where cl
where msbuild
where inf2cat
where stampinf
where tracewpp
where windbg
```

Also inspect:

```text
C:\Program Files (x86)\Windows Kits\10\
C:\Program Files (x86)\Windows Kits\10\build
```

Answer whether WDK is now installed or still missing.

## Task 2 — Install/Fix Missing Driver Tooling

Use official Microsoft sources only.

Target outcomes:

- Visual Studio driver-development components present
- Spectre libraries present
- WDK installed
- matching Windows SDK installed
- WinDbg installed if feasible

If `winget` is unavailable, use Visual Studio Installer and/or official Microsoft SDK/WDK installers.

If elevation blocks unattended install, capture the exact blocker and use the least-manual safe path possible.

## Task 3 — Re-run Scaffold Preparation If Needed

Use:

```powershell
powershell -ExecutionPolicy Bypass -File driver\scaffold\audapp-input\prepare.ps1 -SampleRoot C:\Users\musta\toolchains\Windows-driver-samples
```

Only do this if the imported upstream sample snapshot is missing or stale.

## Task 4 — Attempt Compile-Only Build Again

Use:

```powershell
powershell -ExecutionPolicy Bypass -File driver\scaffold\audapp-input\build.ps1 -SampleRoot C:\Users\musta\toolchains\Windows-driver-samples
```

or, if preparation already exists:

```powershell
powershell -ExecutionPolicy Bypass -File driver\scaffold\audapp-input\build.ps1
```

## Task 5 — If Build Fails, Fix Only the Real Compile/Project Issues

If the build progresses past the missing-WDK stage and fails again:

- capture the first meaningful error,
- determine whether it is:
  - project configuration,
  - missing include/imported sample content,
  - SDK/WDK mismatch,
  - Spectre/library mismatch,
  - Visual Studio toolset mismatch,
  - source compile error,
- fix only what is needed for compile-only success,
- retry carefully.

Do not pivot to packaging, signing, installation, or runtime testing.

## Task 6 — Write a Follow-up Report

Create or update a report at:

```text
C:\Users\musta\Audapp\docs\superpowers\reports\2026-05-30-audapp-phase-12b-driver-compile-fix-build-report.md
```

Include:

1. what tooling was added or fixed,
2. exact versions/paths,
3. whether WDK build tools are now present,
4. exact build command(s) run,
5. final compile-only result,
6. first remaining blocker if still failing,
7. exact next step.

## Final Response Format

When finished, report:

1. whether WDK is now installed,
2. whether Spectre libs are now installed,
3. whether WinDbg is now installed,
4. whether compile-only build was re-attempted,
5. whether compile-only build passed or failed,
6. first meaningful error if failed,
7. path to the Phase 12B report,
8. exact next step.

Keep the response direct and implementation-focused.
