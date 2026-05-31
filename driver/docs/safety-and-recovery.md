# Safety, risks, and recovery

**Phase 11B:** Risk documentation only — no driver testing in this phase.

Kernel audio drivers affect the **entire system**. Treat all future driver work as high-impact.

## Risk matrix

| Risk | Impact | Likelihood (if rushed) | Mitigation |
|------|--------|------------------------|------------|
| **BSOD / kernel crash** | Work loss, data loss on unsaved apps | Medium on first POC | VM only; minimal driver logic; staged milestones |
| **Audio stack instability** | No sound system-wide; apps hang on audio | Medium | Test VM; never auto-install; kill-switch uninstall doc |
| **Driver signing failure** | Driver won’t load; wasted debug time | Medium in 11C | Test-sign plan on VM only; verify catalog |
| **Installer failure** | Partial install, orphaned devices | Medium in 12B | Idempotent install scripts; logged steps |
| **Uninstall failure** | Persistent broken audio | Low–medium | `pnputil` docs; Safe Mode; VM snapshot |
| **Admin / elevation abuse perception** | User distrust | Ongoing | Elevate only for install; clear copy |
| **Latency / glitches** | Bad product reviews | Medium in bridge | IOCTL POC first; shared-mem later; metrics |
| **Remote support difficulty** | Long debug cycles | High | Driver version IOCTL; export logs; keep user-mode fallback |

## Testing rules (mandatory for Phase 11C+)

| Rule | Rationale |
|------|-----------|
| **No first install on primary dev machine** | BSOD or broken audio disrupts all work |
| Use **Hyper-V VM** or spare PC | Snapshot restore in minutes |
| **Snapshot before** `pnputil` / Device Manager install | Roll back entire OS state |
| **One change per test** | Know what caused regression |
| Keep **Voicemeeter / Routing Lab** path on host | Product remains usable if VM dies |

## Recovery mechanisms

### VM snapshot

- Create checkpoint: `pre-audapp-driver-install`.
- Revert if audio fails or system is unstable.

### System Restore / backup

- On physical test machines, enable restore point before install.
- Not a substitute for VM-first discipline.

### Safe Mode

- Boot Safe Mode if normal boot hangs on audio stack.
- Remove driver via Device Manager (show hidden) or `pnputil /delete-driver` from elevated cmd.

### Test-signing revert (dev machines only)

- After experiments: `bcdedit /set testsigning off` + reboot.
- Document in test machine runbook — not for 11B execution.

### Audapp product fallback

- Routing Lab + virtual cable remains **supported user path** until driver is production-ready.
- User-mode loopback (Phase 10C track) reduces dependency on third-party cables without kernel risk.

## Crash dumps and logs (future)

| Artifact | When |
|----------|------|
| **Minidump / kernel dump** | After BSOD — WinDbg analysis |
| **Driver TraceView / WPP** | During 11C+ bring-up |
| **Audapp routing status** | User-mode — underrun/overrun already in `AudioRoutingRuntimeStatus` |
| **Event Viewer** | System log for driver load failures |

Collect procedures belong in Phase 11C test runbook, not executed in 11B.

## Permissions and trust

| Scenario | Elevation |
|----------|-----------|
| Install/uninstall driver | Required |
| Daily Audapp mixing/EQ/routing | Not required |
| Test-signing `bcdedit` | Required — dev VM only |

Never combine “run Audapp as admin” with normal product guidance.

## Communication to users (future)

- Driver is optional advanced feature until signed and stable.
- Uninstall instructions in installer and docs.
- No silent driver install with app update.

## Phase 11B guarantee

| Item | Status |
|------|--------|
| Driver compiled | **No** |
| Driver installed | **No** |
| test-signing enabled | **No** |
| Admin commands run for driver | **No** |
| Host audio stack modified | **No** |

See [phase-11c-go-no-go.md](phase-11c-go-no-go.md) before any compile or install.
