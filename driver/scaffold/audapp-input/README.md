# Audapp Input scaffold

This directory is the isolated compile-only scaffold for Audapp's future virtual render endpoint:

```text
Audapp Input
```

## What this is

- a Phase 11C preparation area for an ACX-first driver spike
- a place for provenance notes, import scripts, and isolated build commands
- a documented path to attempt compile-only work without touching Cargo or Tauri

## What this is not

- not a shipping driver
- not an installed driver
- not proof that Windows already exposes `Audapp Input`
- not the driver-to-app transport implementation

## Relation to Audapp

The long-term purpose is to replace the current third-party virtual cable capture source with an Audapp-owned endpoint. The app-side routing and DSP stack remain out of scope here.

## Current state

- compile status: blocked until a local official sample checkout and full WDK build prerequisites are present
- install status: never installed from this scaffold
- load status: never loaded from this scaffold

## Safety

Read `SAFETY.md` before any future compile or install experimentation.
