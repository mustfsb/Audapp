# WDK and development prerequisites (future phases)

**Phase 11B:** Reference only. Do **not** install WDK or enable test-signing as part of this phase.

This document lists what is needed before **Phase 11C** (compile-only virtual endpoint POC) and later driver work.

## Operating system

| Item | Recommendation |
|------|----------------|
| Host OS | **Windows 11** (matches current Audapp development environment) |
| Target OS | Windows 10 2004+ and Windows 11 for audio stack parity; test matrix TBD in 11C |
| Primary dev machine | Use for **editing and compiling** only after WDK is installed |
| Driver install/test | **Never on primary machine first** — use a VM or disposable test PC |

## Visual Studio and build tools

| Component | Notes |
|-----------|--------|
| **Visual Studio 2022** | Community, Professional, or Enterprise |
| **Desktop development with C++** workload | Required for native driver projects |
| **Windows 11 SDK** (or SDK matching target) | Must align with WDK version |
| **MSVC v143** toolset | Standard for current WDK samples |

Alternative: **Enterprise WDK (EWDK)** — self-contained ISO/environment that bundles VS Build Tools + WDK + SDK for reproducible driver builds without polluting the main VS install. Useful for CI or clean-room builds later.

## Windows Driver Kit (WDK)

| Item | Notes |
|------|--------|
| **WDK for Windows 11, version 24H2** (or current stable matching your SDK) | Install **after** Visual Studio; WDK installer integrates with VS |
| Version pairing | WDK release must match the installed **Windows SDK** major version — mismatches cause build failures |
| **Spectre-mitigated libraries** | WDK builds often require `/Qspectre` mitigated libs; install via Visual Studio Installer → Individual components → search “Spectre” for the MSVC version you use |
| Documentation | [Windows driver documentation](https://learn.microsoft.com/en-us/windows-hardware/drivers/) |

## Audio-specific samples (reference, not copied in 11B)

| Sample | Location / purpose |
|--------|-------------------|
| **SYSVAD** | Classic PortCls virtual audio miniport — structural reference for virtual endpoints |
| **ACX samples** | WDF Audio Class Extensions — Microsoft’s recommended direction for new audio drivers |
| **Windows Driver Samples repo** | GitHub `Microsoft/Windows-driver-samples` — audio subtree |

Phase 11C should clone or reference samples on the **build machine** only; this repo does not vendor them in 11B.

## Test environment

| Practice | Rationale |
|----------|-----------|
| **Hyper-V VM** or spare physical PC | Kernel bugs can BSOD or break system-wide audio |
| Snapshot / checkpoint before first driver load | Fast rollback |
| **System Restore** or backup | Recovery if uninstall fails |
| Separate Windows user optional | Limits blast radius during experiments |

## Test-signing (documented for future use only)

Test-signing allows loading **self-signed** drivers during development. It is **not** required for Phase 11B and must **not** be enabled now.

| Topic | Future detail (11C+ with explicit approval) |
|-------|-----------------------------------------------|
| `bcdedit /set testsigning on` | Requires **admin**, **reboot**, desktop **watermark** |
| Test certificate | Create via `MakeCert` / `New-SelfSignedCertificate` or WDK test cert workflow |
| Scope | **Dev/test machines only** — not for end users |
| Revert | `bcdedit /set testsigning off` + reboot when done |

**Why deferred in 11B:** Test-signing changes boot policy and trust boundaries. Phase 11B is docs/scaffold only; no driver to sign or load.

## Admin and elevation

| Action | Elevation |
|--------|-----------|
| Normal Audapp use | **No admin** (unchanged) |
| WDK install | Often requires admin |
| Driver install (`pnputil`, Device Manager, custom installer) | **Admin** |
| Test-signing `bcdedit` | **Admin** |
| Day-to-day routing/DSP in Audapp | **No admin** |

Plan UX so elevation is required **only** for install/uninstall, never for everyday audio processing.

## Safe rollback and uninstall planning

Before any future install (11C+):

1. Document driver **hardware ID**, **INF name**, and **service name**.
2. Prepare `pnputil /delete-driver` or equivalent uninstall steps.
3. Test uninstall on VM **before** testing on a second machine.
4. Keep a VM snapshot labeled “pre-Audapp-driver”.
5. Know **Safe Mode** path if the audio stack fails to start (see [safety-and-recovery.md](safety-and-recovery.md)).

## Repo integration (Audapp-specific)

| Rule | Status in 11B |
|------|----------------|
| `driver/` not in Cargo workspace | **Enforced** — no `Cargo.toml` under `driver/` |
| No WDK steps in `npm run build` / `cargo build` | **Enforced** |
| Isolated build entry point (future) | e.g. `driver/scaffold/build.ps1` documented in 11C, not wired to app CI |

## Checklist before Phase 11C

Use [phase-11c-go-no-go.md](phase-11c-go-no-go.md) for the full gate. Minimum prerequisites:

- [ ] Windows 11 dev host (or agreed OS matrix)
- [ ] VS 2022 + C++ workload + matching SDK
- [ ] WDK installed and version-matched to SDK
- [ ] Spectre-mitigated libs installed (if build requires them)
- [ ] VM or disposable test machine ready
- [ ] Rollback plan read and understood
- [ ] Test-signing understood but **not enabled** until explicit 11C install approval
