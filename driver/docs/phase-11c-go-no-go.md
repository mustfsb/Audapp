# Phase 11C go / no-go checklist

**Phase 11C target:**

```text
Compile-only minimal "Audapp Input" virtual endpoint POC
```

- Endpoint appears in Windows Sound settings and Audapp `probe_device_formats()`.
- Driver accepts render audio and may initially render-to-null internally.
- No driver-to-app transport in this phase.
- No install by default unless explicitly approved for a VM or disposable test machine.

## Prerequisites

| # | Item | Current status | Compile gate |
|---|------|----------------|--------------|
| 1 | Phase 11A plan read and accepted | Complete | Keep as source of truth |
| 2 | `wdk-prerequisites.md` reviewed | Complete | WDK + VS + SDK installed |
| 3 | `sysvad-vs-acx-decision.md` accepted | Complete | ACX sample path chosen |
| 4 | `driver-app-transport.md` accepted | Complete | Transport deferred to 11D |
| 5 | `signing-and-distribution.md` understood | Complete | Test-sign plan remains VM-only |
| 6 | `safety-and-recovery.md` understood | Complete | VM + rollback ready |

## Engineering gates

| # | Item | Status |
|---|------|--------|
| 7 | Isolated `driver/` scaffold exists | Complete - `driver/scaffold/audapp-input/` created |
| 8 | No dependency on Tauri/Cargo build | Complete - changes remain under `driver/` |
| 9 | Isolated build strategy defined | Complete - `prepare.ps1` and `build.ps1` added |
| 10 | Sample reference identified | Complete - ACX AudioCodec + SYSVAD reference documented |
| 11 | Device name frozen: `Audapp Input` | Complete |
| 12 | Compile-only acceptance criteria written | Complete |

## Environment gates

| # | Item | Status |
|---|------|--------|
| 13 | Windows 11 dev host | Assumed from current Audapp environment |
| 14 | WDK version matches installed Windows SDK | Blocked - WDK build root not found |
| 15 | Spectre-mitigated libs installed | Unknown |
| 16 | VM or disposable test machine available | Unknown |
| 17 | VM snapshot procedure documented | Documented, not verified in session |
| 18 | Test-signing understood but not enabled | Documented and unchanged |

## Install gates

| # | Item | Default |
|---|------|---------|
| 19 | Compile without install | Yes |
| 20 | Local test-signed install | No unless explicitly approved |
| 21 | Install only on VM/test machine | Required |
| 22 | Uninstall steps documented before first install | Required |
| 23 | Primary dev machine install | Forbidden for first POC |

## Product gates

| # | Item | Status |
|---|------|--------|
| 24 | Audapp app behavior unchanged by 11C driver work | Complete in this change set |
| 25 | Routing Lab / Voicemeeter path still works | Not exercised here because app code was untouched |
| 26 | No APO / system-wide EQ scope creep | Complete |
| 27 | User-mode loopback track still valued as fallback | Unchanged |

## Compile-only acceptance criteria

When proceeding to compile:

1. Driver project builds with WDK without errors.
2. Output is a `.sys` plus packaging artifacts and nothing is loaded by default.
3. Build is invoked only from isolated `driver/` tooling.
4. No changes to `src-tauri` routing or DSP hot paths are required for 11C.
5. Documentation records exact build command and output paths.

When proceeding to install later with separate approval:

1. All environment gates above are satisfied.
2. Test-signed package is used only on a VM or disposable machine.
3. `Audapp Input` appears in Sound settings.
4. `probe_device_formats()` lists the endpoint.
5. Render-to-null or equivalent accepts audio without BSOD for a bounded soak test.
6. Uninstall succeeds on the same test machine.

## Current recommendation

```text
Go / No-Go:
- Go for more compile-only work once WDK tooling and a local official sample checkout are available.
- No-Go for install work and No-Go for Phase 11D implementation until a real Phase 11C compile result exists.
```

## Related documents

- `../README.md`
- `phase-11c-compile-only-poc.md`
- `phase-11d-transport-preview.md`
- `../../docs/superpowers/specs/2026-05-30-audapp-phase-11a-virtual-audio-device-architecture-plan.md`
