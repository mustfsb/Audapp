# Phase 11C go / no-go checklist

**Phase 11C target:**

```text
Compile-only minimal "Audapp Input" virtual endpoint POC
```

- Endpoint appears in Windows Sound settings and Audapp `probe_device_formats()`.
- Driver accepts render audio (may use render-to-null internally).
- **No driver↔app transport** (deferred to 11D).
- **No install by default** unless explicitly approved for a VM/test machine.

**Phase 11B** completes when this checklist exists and prerequisites are documented — not when every box is checked.

---

## Prerequisites

| # | Item | 11B | 11C gate |
|---|------|-----|----------|
| 1 | Phase 11A plan read and accepted | Done (plan exists) | ☐ |
| 2 | [wdk-prerequisites.md](wdk-prerequisites.md) reviewed | Documented | ☐ WDK + VS + SDK installed |
| 3 | [sysvad-vs-acx-decision.md](sysvad-vs-acx-decision.md) accepted | Documented | ☐ ACX sample path chosen |
| 4 | [driver-app-transport.md](driver-app-transport.md) accepted | Documented | ☐ Transport deferred to 11D |
| 5 | [signing-and-distribution.md](signing-and-distribution.md) understood | Documented | ☐ Test-sign plan for VM only |
| 6 | [safety-and-recovery.md](safety-and-recovery.md) understood | Documented | ☐ VM + rollback ready |

---

## Engineering gates

| # | Item | Gate |
|---|------|------|
| 7 | Isolated `driver/` scaffold exists | ☐ (11B deliverable) |
| 8 | **No** dependency on Tauri/Cargo build | ☐ Verify `cargo build` unchanged |
| 9 | Isolated build strategy defined (script/path in `driver/scaffold/`) | ☐ Before first compile |
| 10 | Sample reference identified (ACX + SYSVAD virtual pattern) | ☐ |
| 11 | Device name frozen: **Audapp Input** (single render endpoint) | ☐ |
| 12 | Compile-only acceptance criteria written in 11C prompt | ☐ |

---

## Environment gates

| # | Item | Gate |
|---|------|------|
| 13 | Windows 11 dev host (or documented OS matrix) | ☐ |
| 14 | WDK version matches installed Windows SDK | ☐ |
| 15 | Spectre-mitigated libs installed (if build requires) | ☐ |
| 16 | **VM or disposable test machine** available | ☐ |
| 17 | VM snapshot procedure documented | ☐ |
| 18 | test-signing **understood** — not enabled until install approved | ☐ |

---

## Install gates (explicit opt-in)

| # | Item | Default |
|---|------|---------|
| 19 | Compile without install | **Yes** — preferred first 11C milestone |
| 20 | Local test-signed install | **No** unless explicitly approved |
| 21 | Install only on VM/test machine | **Required** if install happens |
| 22 | Uninstall steps documented before first install | **Required** |
| 23 | Primary dev machine install | **Forbidden** for first POC |

---

## Product gates

| # | Item | Gate |
|---|------|------|
| 24 | Audapp app behavior unchanged by 11C driver work | ☐ |
| 25 | Routing Lab / Voicemeeter path still works | ☐ |
| 26 | No APO / system-wide EQ scope creep | ☐ |
| 27 | User-mode loopback track (10C) still valued as parallel fallback | ☐ |

---

## Compile-only acceptance criteria (11C)

When proceeding to **compile** (not necessarily install):

1. Driver project builds with WDK without errors.
2. Output is a `.sys` (+ INF/cat as needed) **not** loaded by default.
3. Build invoked only from isolated `driver/` tooling — not `cargo build`.
4. No changes to `src-tauri` routing/DSP hot paths for 11C.
5. Documentation updated with exact build command and output paths.

When proceeding to **install** (separate approval):

1. All environment gates (rows 13–18) checked.
2. Test-signed package on VM only.
3. **Audapp Input** visible in Sound settings.
4. `probe_device_formats()` lists the endpoint (manual verification).
5. Render-to-null or equivalent accepts audio without BSOD for N minutes.
6. Uninstall verified on same VM.

---

## Recommendation format

After Phase 11C spike (or if blocked before starting 11C):

```text
Go / No-Go:
- Go if ...
- No-Go if ...
```

### Go if

- WDK + VS + matching SDK are installed and a hello-world ACX (or agreed) sample **compiles** on the team machine.
- VM or disposable test PC is ready with snapshot workflow.
- Isolated `driver/scaffold/` build entry exists and does **not** touch Cargo/Tauri.
- Team accepts **ACX target, SYSVAD reference** and defers transport to 11D.
- Rollback/uninstall steps are written before any install experiment.
- Compile-only milestone is agreed; install is a **separate** explicit approval.

### No-Go if

- WDK cannot be installed or licensed on dev hardware.
- No VM/test machine available (install would be forced on primary OS).
- ACX virtual endpoint path fails compile spike with no time-boxed alternative plan.
- Stakeholders require public distribution before test infrastructure exists.
- Scope creep detected (APO, multi-endpoint, in-kernel DSP, auto per-app routing).
- Audapp release timeline cannot tolerate parallel maintenance of driver + user-mode fallback.

---

## Phase 11B outcome (this document’s status)

| Deliverable | Status |
|-------------|--------|
| Checklist created | **Complete** |
| All prerequisite docs in `driver/docs/` | **Complete** |
| Driver compiled/installed in 11B | **N/A — forbidden** |

**Preliminary 11B recommendation:** **Conditional Go** toward Phase 11C planning — proceed to **compile-only** POC when WDK/VM gates are met; remain **No-Go** on any install until checklist rows 13–23 are satisfied and explicitly approved.

---

## Related documents

- [../README.md](../README.md)
- Phase 11A: `docs/superpowers/specs/2026-05-30-audapp-phase-11a-virtual-audio-device-architecture-plan.md`
