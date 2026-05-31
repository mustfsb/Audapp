# Driver signing and distribution paths

**Phase 11B:** Document both paths; **defer all cost and execution.**

```text
Phase 11B does not buy certificates, sign drivers, build an installer, or distribute a driver.
```

## Why signing matters

Windows loads kernel drivers only when policy allows:

| Mode | Who | Driver signature |
|------|-----|------------------|
| Production user machines | Customers | **Microsoft-trusted** (attestation/WHQL) + Authenticode on installer |
| Dev/test (future 11C+) | Developers on VM | **Test-signing** + self-signed test cert |

Unsigned drivers do not load on default Windows configurations.

---

## Path A — Development and test (not for public users)

### Test-signed local development

| Step | Notes (future — not 11B) |
|------|--------------------------|
| Enable test-signing | `bcdedit /set testsigning on` — admin, reboot, watermark |
| Create test certificate | WDK / `MakeCert` / PowerShell self-signed |
| Sign `.sys` and `.cat` | `signtool` with test cert |
| Install on **VM or disposable PC** | `pnputil /add-driver` or dev install script |

### Constraints

- **Never** ship test-signed drivers to end users.
- SmartScreen and driver policy will reject or warn appropriately on normal machines.
- Requires clear **uninstall** and **rollback** docs ([safety-and-recovery.md](safety-and-recovery.md)).

### Rollback / uninstall requirements (dev)

- Document INF name, published name, and `pnputil /delete-driver` steps.
- VM snapshot before first load.
- Plan Safe Mode removal if audio stack fails.

---

## Path B — Public distribution (deferred)

### EV code-signing certificate

| Topic | Notes |
|-------|--------|
| Purpose | Authenticode signing for installer and sometimes driver submission chain |
| Cost | **Deferred** — budget when committing to public driver release |
| Process | Purchase from public CA, hardware token/HSM requirements per CA |
| Renewal | Operational plan required before first public release |

### Microsoft Partner Center — hardware developer

| Topic | Notes |
|-------|--------|
| Account | Microsoft Partner Center hardware/dev account |
| **Attestation signing** | Common path for drivers that pass Microsoft’s automated checks (not full custom WHQL test pass for every change) |
| **WHQL** | Full certification when required by policy or enterprise customers |
| Submission | Packaged driver + INF + catalog through Hardware Dev Center portal |

### Packaged installer (Phase 12B+)

| Component | Notes |
|-----------|--------|
| Installer | MSI/EXE with elevated install for driver + optional service |
| Uninstaller | Must remove driver, services, and device nodes cleanly |
| Versioning | Driver + app version coupling documented for support |
| Elevation UX | Explain why admin is needed **once** at install |

### User trust

| Risk | Mitigation (later) |
|------|---------------------|
| SmartScreen | Authenticode-signed installer |
| Antivirus false positives | Reputable cert, standard packaging, transparency |
| “Why does Audapp need a driver?” | Honest copy: virtual device only, uninstall path, link to docs |

---

## Comparison summary

| Aspect | Dev/test path | Public path |
|--------|---------------|-------------|
| Certificate | Self-signed test | EV + Microsoft attestation/WHQL |
| Machine | VM / disposable | Any supported Windows |
| test-signing | Yes (dev only) | No |
| Admin at install | Yes | Yes |
| Cost | Low (time + VM) | **EV cert + Partner Center + engineering** (deferred) |
| Audapp Phase | 11C–11E experiments | 12B+ |

---

## Relationship to Audapp app signing

Today (`tauri.conf.json`): user-mode bundle, no driver, no elevation for normal use.

Future: **two artifacts** possible:

1. **Audapp desktop app** — standard app signing (optional, separate from driver).
2. **Audapp audio driver** — kernel signing via Microsoft hardware portal.

They should be versioned and documented separately; driver install must not be silent.

---

## Phase 11B boundaries

| Action | Allowed in 11B? |
|--------|-----------------|
| Document paths | Yes |
| Buy EV cert | **No** |
| Sign any binary | **No** |
| Build installer | **No** |
| Enable test-signing | **No** |
| Distribute driver | **No** |

See [wdk-prerequisites.md](wdk-prerequisites.md) for test-signing reference (future only).
