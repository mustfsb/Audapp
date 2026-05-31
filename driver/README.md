# Audapp - Virtual Audio Driver

**Phase:** 11C compile-only scaffold spike  
**Status:** Scaffolded, not installed, not loaded

This folder holds the isolated driver-side work for Audapp's future kernel-mode virtual audio endpoint. It remains intentionally decoupled from the shipping Tauri/Rust application.

## What this folder is

- Research and implementation notes for a future Audapp-owned endpoint named `Audapp Input`.
- Safety, build, and provenance docs for a compile-only WDK/ACX spike.
- A scaffold under `scaffold/audapp-input/` with scripts that can import an official Microsoft sample checkout and attempt a local compile without installing anything.

## What this folder is not

- Not part of Cargo, npm, or Tauri build flows.
- Not an installer, signer, or driver loading path.
- Not proof that Audapp has a working virtual endpoint today.

## Relationship to the working app

| Area | Impact |
|------|--------|
| `src/`, `src-tauri/` | Unchanged |
| Cargo / Tauri build | Does not include `driver/` |
| Current user path | Still uses virtual cable / Voicemeeter into Routing Lab |

Long-term target:

```text
App audio -> Audapp Input -> Audapp routing/DSP -> selected physical output
```

Current working path:

```text
App audio -> VB-CABLE / Voicemeeter -> Routing Lab capture -> Audapp DSP/EQ -> physical output
```

The driver effort only aims to replace the capture source over time. Existing routing, DSP, render, and UI behavior stay out of scope here.

## Documentation index

| Document | Purpose |
|----------|---------|
| [docs/wdk-prerequisites.md](docs/wdk-prerequisites.md) | WDK, VS, SDK, VM, and signing prerequisites |
| [docs/sysvad-vs-acx-decision.md](docs/sysvad-vs-acx-decision.md) | ACX target and SYSVAD reference rationale |
| [docs/driver-app-transport.md](docs/driver-app-transport.md) | Driver-to-user-mode transport design |
| [docs/signing-and-distribution.md](docs/signing-and-distribution.md) | Signing path and distribution constraints |
| [docs/safety-and-recovery.md](docs/safety-and-recovery.md) | BSOD, rollback, and VM guidance |
| [docs/phase-11c-go-no-go.md](docs/phase-11c-go-no-go.md) | Phase gate checklist |
| [docs/phase-11c-compile-only-poc.md](docs/phase-11c-compile-only-poc.md) | Phase 11C execution record |
| [docs/phase-11d-transport-preview.md](docs/phase-11d-transport-preview.md) | Phase 11D boundary preview |

## Scaffold

See [scaffold/README.md](scaffold/README.md) and [scaffold/audapp-input/README.md](scaffold/audapp-input/README.md).

The scaffold is intentionally conservative:

- It prefers official Microsoft sample inputs over a large vendored sample dump.
- It only supports compile-only attempts.
- It fails fast when WDK, MSBuild, or a local sample checkout are missing.

## Source of truth

Architecture decisions begin with:

`docs/superpowers/specs/2026-05-30-audapp-phase-11a-virtual-audio-device-architecture-plan.md`

## Warning

```text
Do not install, load, or test-sign any driver from this folder as part of Phase 11C.
```
