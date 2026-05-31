# Audapp — Virtual Audio Driver (Research & Scaffold)

**Phase:** 11B — documentation and isolated scaffold only  
**Status:** Not compiled, not installed, not loaded

This folder holds research, architecture notes, and a placeholder scaffold for Audapp’s **future** kernel-mode virtual audio driver. It is deliberately isolated from the shipping Audapp application.

## What this folder is

- Research and planning for an **Audapp-owned virtual audio endpoint** (e.g. `Audapp Input`) that Windows apps can select as their output device.
- Architecture notes for WDK, ACX, SYSVAD patterns, driver↔app transport, signing, and safety.
- A non-built `scaffold/` placeholder for future driver source layout (Phase 11C+).

## What this folder is not

- **No driver is compiled or installed in Phase 11B.**
- No WDK build steps are wired into Cargo or Tauri.
- No `.sys` binaries, installers, or test-signing setup.

## Relationship to the working app

| Area | Phase 11B impact |
|------|------------------|
| `src/`, `src-tauri/` | **Unchanged** — Routing Lab, Engine Lab, DSP/EQ, Mixer, discovery |
| Cargo / Tauri build | **Does not include** `driver/` (not a workspace member, no package scripts) |
| Current user path | **Unchanged** — manual virtual cable / Voicemeeter → Routing Lab capture → DSP/EQ → physical output |

**Long-term target:**

```text
App audio → Audapp-owned virtual endpoint → Audapp routing/DSP → selected physical output
```

**Current working path (unchanged):**

```text
App audio → VB-CABLE / Voicemeeter → Routing Lab capture → Audapp DSP/EQ → physical output
```

A future driver only replaces the **capture source**; the existing duplex worker, ring buffer, DSP pipeline, and render path are intended to be reused (see Phase 11A plan).

## Documentation index

| Document | Purpose |
|----------|---------|
| [docs/wdk-prerequisites.md](docs/wdk-prerequisites.md) | WDK, VS, SDK, VM, test-signing (future only) |
| [docs/sysvad-vs-acx-decision.md](docs/sysvad-vs-acx-decision.md) | ACX vs SYSVAD / PortCls for Audapp |
| [docs/driver-app-transport.md](docs/driver-app-transport.md) | Driver ↔ user-mode communication design |
| [docs/signing-and-distribution.md](docs/signing-and-distribution.md) | Test-sign vs EV + attestation (deferred cost) |
| [docs/safety-and-recovery.md](docs/safety-and-recovery.md) | BSOD, rollback, VM testing |
| [docs/phase-11c-go-no-go.md](docs/phase-11c-go-no-go.md) | Checklist before compile-only POC |

## Scaffold

See [scaffold/README.md](scaffold/README.md). Placeholder only — no source to build.

## Source of truth

Architecture decisions are defined in:

`docs/superpowers/specs/2026-05-30-audapp-phase-11a-virtual-audio-device-architecture-plan.md`

## Warning

```text
Do not install or test-sign any driver from this folder. Phase 11B is documentation/scaffold only.
```
