# Audapp — Phase 22A: Host Machine Install Safety Report

- **Date:** 2026-06-06 (filed under the 2026-06-05 phase-22 series)
- **Phase:** 22A — design the safe path to install Audapp on the user's real Windows 10 19045 host
- **Branch / Worktree:** `main` / `C:\Users\musta\Audapp` (HEAD `73e3fba`)
- **Mode:** PLANNING / DOCUMENTATION ONLY — no install, no uninstall, no `pnputil`/`devgen`/`bcdedit`, no test-signing change, no default-device change, no source changes
- **Result:** **GO for 22B.** Recommendation locked: **AudappChannels only**, **test-signing now**. Host install (22E) remains **gated** on VM reboot-persistence verification (22C).
- **Companion spec:** `docs/superpowers/specs/2026-06-05-audapp-phase-22a-host-install-safety-plan.md`

---

## 1. What Was Inspected (read-only)

Repo state: branch `main`, **clean** working tree, HEAD `73e3fba` ("app: productize multichannel Audapp routing").

**App runtime — depends only on the four channels, never on Audapp Input:**
- `src-tauri/src/audio_bridge/multichannel_manager.rs:225-229` — `require_multichannel_endpoints()` errors if `general/music/game/browser` is `None`; **never** checks `legacy_input`.
- `src-tauri/src/audio_bridge/multichannel_worker.rs:174-180` — worker iterates exactly `general, music, game, browser`; Audapp Input never referenced.
- `src-tauri/src/audio_bridge/endpoints.rs:173-220` — physical-output resolver **explicitly rejects every Audapp endpoint** (incl. Audapp Input) as the sink, fail-closing to an active non-Audapp render device.
- `src-tauri/src/audio/audapp_endpoint.rs:55-60,63-74` — channels classified by lowercased friendly-name substring (`"audapp general"` … `"audapp browser"`), locale-prefix independent; mirrored in `src/lib/audapp-endpoints.ts:22-27`.
- Audapp Input (`audapp_endpoint.rs:11-12,76-82`) and AudioMulti (`:15-16,84-90`) are classification/diagnostic only — surfaced in the `multichannel_manager.rs:199` candidate list and the UI "Legacy" badge, never in the routing critical path.

**Driver package (`driver/scaffold/audapp-channels/`):** `AudioChannels.inf` → `CatalogFile=AudappChannels.cat`, service `AudappChannels`, hardware IDs `ROOT\AudappGeneral|AudappMusic|AudappGame|AudappBrowser`, DeviceDesc "Audapp General/Music/Game/Browser", **render-only**. No `ROOT\AudappInput`/`ROOT\AudappMulti`/oem19 references. Build/sign scripts (`build-channels.ps1`, `Generate-Catalog-channels.ps1`, `Sign-Catalog-channels.ps1`) already enforce identity guards and are compile/sign-only. Signing = self-signed test cert `CN=Audapp VM Test Code Signing` (thumbprint `C9C96275386BCDA269FE344FE805C4D668C52F86`). Devnodes are created with WDK `devgen.exe`. **No host install/uninstall scripts exist yet** — all VM work to date was manual one-off commands.

**Phase reports reviewed:** 21G (VM install/endpoint test — the central proof), 21H (app discovery mapping), 21I (multichannel routing architecture fix), 21J (productization + UI state), plus `driver/docs/safety-and-recovery.md`.

**Key proven facts (21G §7–13):** four devnodes `AUDAPPGENERAL0001/MUSIC0001/GAME0001/BROWSER0001`, all `ProblemCode = 0` (no Code 37), four distinct + persistent endpoint names, names survive disable/enable, all four pass WASAPI Activate/GetMixFormat/Initialize/Start/Stop at 44100 Hz / 2 ch / f32; Audapp Input and AudioMulti untouched and healthy. Build health (21J): 91 Rust + 62 TS tests passing, `npm run build` clean.

---

## 2. Decisions (and why)

**D1 — Install AudappChannels only (no Audapp Input on host).** Code evidence above shows render routing requires only the four channels and explicitly rejects Audapp endpoints as the physical sink. Removing Audapp Input breaks no non-diagnostic path; the only lost function is the Audapp **microphone/capture** endpoint (the four channels are render-only). **User chose Channels-only**, accepting the mic loss on the host. Smallest blast radius (one package, four devnodes, one service). AudioMulti is never installed.

**D2 — Test-signing now.** Reuse `CN=Audapp VM Test Code Signing`; import the public cert to `LocalMachine\Root` + `LocalMachine\TrustedPublisher`; require testsigning ON (reboot to enable) and Secure Boot OFF. **User chose test-signing now**, accepting the watermark + Secure Boot tradeoff as the fastest route off the VM. Production/EV signing is the recommended long-term exit.

**D3 — Bundle `devgen.exe`; do not require full WDK on host.** No clean `pnputil` substitute exists for separate-root devgen devices on Win10 19041/19045. 22B bundles `devgen.exe` from the build machine's WDK into `scripts/host-install/bin/` with hash/signature validation; the host needs no WDK.

---

## 3. Host-vs-VM Gaps the Design Must Handle

1. **Test-signing was already ON in the VM** (21G §5, no reboot needed); the host almost certainly is not → installer checks, then requires `bcdedit /set testsigning on` + reboot, and **aborts if Secure Boot is ON** (test-signing is inert under Secure Boot).
2. **OEM name is not portable.** The VM published `oem22.inf` (21G §6); the host will assign a **different** `oemNN.inf`. The uninstaller must **resolve the published name dynamically** (Original Name `audiochannels.inf` + Provider `Audapp` + Class `MEDIA`) and **abort** before touching `oem19` (Audapp Input) / `oem20`/`oem21` (AudioMulti) or any non-AudappChannels package. **Never hardcode a number.**
3. **Built/signed artifacts are not on `main`.** They live in the `Audapp-21B` worktree (`...\Audapp-21B\driver\scaffold\audapp-channels\package\Debug\x64`, gitignored). 22B must stage a signed copy into the host-install `payload/`.
4. **Default-device hijack.** Windows auto-promoted Audapp Music to system default in 21G (§13 side-effect). The installer must capture the pre-install default and reset it back; never leave the default on an Audapp endpoint.
5. **Reboot persistence is unverified even in the VM** (21G §11). This must be proven in the VM (22C) before any host attempt (22E).

---

## 4. Risk Table

| Risk | Rating | Mitigation |
|---|---|---|
| Driver Code 37 (driver won't start) | **Low** | Separate-root architecture proven in 21G (4× ProblemCode 0); installer stops on Code 37 |
| BSOD / kernel crash | **Low–Med** | VM-validated minimal driver; restore point + disk image; WinRE/Safe Mode path |
| Secure Boot / test-signing posture change | **Med** | Explicit user decision; watermark accepted; revert path documented; BitLocker key staged |
| Anti-cheat / security software complaints | **Med** | Close anti-cheat before install; test-signed unknown driver may be flagged — user informed |
| Audio default hijack (Music auto-default) | **Med** | Capture pre-install default; reset after install; `Reset-AudappAudioDefault.ps1` |
| Failed / partial uninstall | **Low–Med** | Dynamic oem resolution; dry-run first; Device Manager + Safe Mode fallback |
| Stale MMDevice endpoints after removal | **Low** | Optional safe cleanup step; reboot clears most; non-fatal |
| Wrong OEM package deletion (oem19/20/21) | **Low** (with guard) | Hard guard: resolve by name/provider/class, abort on non-AudappChannels match; never hardcode a number |
| Host app crash after driver install | **Low** | Runtime already hardened (21I/21J, 91 Rust + 62 TS tests); fail-closed resolver |
| Format / WASAPI runtime issues | **Low** | 21G WASAPI probe passed (44100 Hz, 2 ch, f32) on all four |
| User confusion re: Volume Mixer per-app assignment | **Med** | Per-app switching still manual; UI guides to Volume Mixer; documented in README |

---

## 5. Host Readiness Checklist (for 22D)

Save/close work and audio apps → create System Restore point (`Checkpoint-Computer -Description "pre-audapp-host-install"`) → optional full disk image → confirm BitLocker recovery key → confirm Secure Boot OFF (`Confirm-SecureBootUEFI`) → accept test-signing implications → record current default render device + full endpoint list → verify physical audio works → ensure elevated PowerShell, clean repo, free disk. (Full version in the spec, §4.)

---

## 6. Installer / Uninstaller Design Summary (for 22B)

Four scripts under `scripts/host-install/` (`Install-AudappHost.ps1`, `Uninstall-AudappHost.ps1`, `Test-AudappHostReadiness.ps1`, `Reset-AudappAudioDefault.ps1`) + `README.md` + `bin/devgen.exe` + `payload/`. Cross-cutting safeguards: dry-run by default, `-ConfirmHostInstall` to mutate, admin check, INF identity guard, print-before-change, timestamped logs, stop on Code 37, stop on missing physical output, never leave default on an Audapp endpoint. Installer order and uninstaller dynamic-oem resolution are detailed in the spec (§5–7).

---

## 7. Rollback / Emergency Summary

**Audio breaks (system boots):** `Reset-AudappAudioDefault.ps1` → stop app → `Uninstall-AudappHost.ps1 -ConfirmHostInstall` → reboot → Device Manager (show hidden) → System Restore → disable testsigning **after** removal. **BSOD / boot failure:** WinRE System Restore (primary) / Safe Mode `pnputil /delete-driver` / WinRE `dism /image:C:\ /remove-driver` / full disk image as the guaranteed net; keep the BitLocker key handy. Full version in the spec (§8–9).

---

## 8. VM-to-Host Staged Path

22A (this — docs) → 22B (build scripts, repo only) → 22C (VM run from clean snapshot; **verify reboot persistence**; prove clean uninstall) → 22D (host readiness) → **22E (gated host install)**. 22E does not proceed until 22C passes.

---

## 9. User Downloads

**For 22A: nothing.** For host install (22E): nothing beyond the repo, **provided** 22B bundles `devgen.exe` and stages the signed package + public `.cer`. The build machine needs the WDK to (re)build/sign; the host does not. Full WDK on the host is avoided.

---

## 10. Commands Run This Phase

Read-only only:
```
git branch --show-current ; git status --short ; git log --oneline -8
# plus read-only file/grep inspection of src-tauri, src, driver/scaffold, docs/superpowers
```
**No** `pnputil`, `devgen`, `bcdedit`, `signtool`, default-device, or any driver/boot/audio mutation command was run.

---

## 11. Files Written

- `docs/superpowers/specs/2026-06-05-audapp-phase-22a-host-install-safety-plan.md`
- `docs/superpowers/reports/2026-06-05-audapp-phase-22a-host-install-safety-report.md`

---

## 12. Go / No-Go

**GO — proceed to Phase 22B** (implement the four host-install scripts, bundle `devgen.exe`, stage the signed payload). **22E (host install) stays gated** on Phase 22C passing in the VM, specifically the still-open **reboot-persistence** verification. Recommendation: **AudappChannels-only + test-signing-now**; production/EV signing is the long-term exit from test-signing.
