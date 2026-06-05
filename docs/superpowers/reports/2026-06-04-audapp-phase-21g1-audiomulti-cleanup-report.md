# Audapp — Phase 21G.1: AudioMulti-Only Cleanup Report

- **Date:** 2026-06-05
- **Phase:** 21G.1 — narrow cleanup of the old AudioMulti / Audapp Multi experiment
- **Worktree:** `C:\Users\musta\Audapp-21B`
- **Scope:** Remove AudioMulti only. Do NOT touch Audapp Input (oem19.inf) or AudappChannels (oem22.inf).
- **Result:** **SUCCESS** — AudioMulti fully removed; all protected devices healthy; default render reset to physical device; final Sound list clean.

---

## Pre-deletion required checks (all passed)

1. **Audapp Input healthy** — `ROOT\DEVGEN\AUDAPP12G0001` Status OK, ProblemCode 0, DriverInfPath **oem19.inf**.
2. **AudappChannels healthy** — four devnodes `ROOT\DEVGEN\AUDAPP{GENERAL,MUSIC,GAME,BROWSER}0001` all Status OK, Service **AudappChannels**, ProblemCode 0, **oem22.inf**. No Code 37.
3. **AudioMulti identity confirmed** — `ROOT\DEVGEN\AUDAPPMULTI21C0001` Service **AudioMulti**, ProblemCode 0, DriverInfPath **oem21.inf**; oem21.inf Original Name **audiomulti.inf** (Provider Audapp). Only this devnode was bound to oem21.inf.

## Actions performed (AudioMulti only)

| Step | Command | Result |
|---|---|---|
| Remove devnode | `pnputil /remove-device "ROOT\DEVGEN\AUDAPPMULTI21C0001"` | Device removed successfully |
| Delete package | `pnputil /delete-driver oem21.inf /uninstall /force` | Uninstalled + deleted successfully |
| Reset default render | `IPolicyConfig::SetDefaultEndpoint` (roles 0/1/2) → physical `{0.0.0.00000000}.{6a08946d-...}` | HRESULT 0x00000000 (S_OK) |
| Remove stale endpoint | `reg delete HKLM\...\MMDevices\Audio\Render\{32a5c561-...}` /f (after take-ownership + grant Administrators FullControl; ACL had only Audiosrv/AudioEndpointBuilder/TrustedInstaller with Delete) | Deleted successfully |

The four active "Audapp Multi" render endpoints + "Mikrofon (Audapp Multi)" capture endpoint were removed automatically by the devnode removal. Only one stale `not_present` render endpoint (`{32a5c561-...}`, leftover from 21C/21D) needed manual registry removal.

## Post-cleanup verification

**No Audapp Multi anywhere:**
- PnP AudioEndpoint class: NONE.
- PnP MEDIA (Service AudioMulti / "Audapp Multi" / AUDAPPMULTI*): NONE.
- MMDevices registry (Render + Capture): NONE.

**Final Windows Sound output list (active render endpoints):**
```
Audapp Browser
Audapp Game
Audapp General
Audapp Input
Audapp Music
High Definition Audio Device   <-- DEFAULT RENDER
```
Matches the target exactly; no Audapp Multi entries.

**Protected devices after cleanup:**
```
Audapp Input    Status OK  ProblemCode 0  oem19.inf
Audapp General  Status OK  Service AudappChannels  ProblemCode 0  oem22.inf
Audapp Music    Status OK  Service AudappChannels  ProblemCode 0  oem22.inf
Audapp Game     Status OK  Service AudappChannels  ProblemCode 0  oem22.inf
Audapp Browser  Status OK  Service AudappChannels  ProblemCode 0  oem22.inf
```

**WASAPI probe (post-cleanup):** 7 endpoints probed, **7/7 pass** Activate/GetMixFormat/Initialize/Start/Stop (exit 0). `High Definition Audio Device` reports `Default render: true`; Audapp Music reports `false` (default successfully moved off Audapp Music). Audapp Input render + capture both pass.

## Driver store after cleanup

- `oem19.inf` (audiocodec.inf, Audapp Input) — present, untouched.
- `oem22.inf` (audiochannels.inf, AudappChannels) — present, untouched.
- `oem21.inf` (audiomulti.inf) — **deleted**.
- `oem20.inf` (audiomulti.inf) — **deleted** (user-approved follow-up; was unbound).

**No `audiomulti.inf` packages remain in the driver store.** (Older `audiocodec.inf` packages oem9–oem18 are the Audapp Input lineage, out of scope and untouched; live Audapp Input is oem19.inf.)

## Resolved item — oem20.inf

`oem20.inf` (older AudioMulti package, audiomulti.inf, DriverVer 4.11.8.286) was confirmed unbound and **deleted** with user approval:
```
pnputil /delete-driver oem20.inf /uninstall /force   -> uninstalled + deleted successfully
```

## Safety / non-impact confirmation

- oem19.inf never targeted; Audapp Input untouched and healthy.
- oem22.inf never targeted; all four AudappChannels devnodes untouched and healthy.
- Registry ownership/ACL change scoped to exactly the one stale endpoint key `{32a5c561-...}` (now deleted); no other keys modified.
- No merge to main.

## Verdict

AudioMulti cleanup complete and verified. The system now presents only the intended endpoints (AudappChannels ×4, Audapp Input, physical device), with the physical device as default render. Ready for Phase 21H.
