# Audapp — Phase 22A: Host Machine Install Safety Plan (Spec)

**Date:** 2026-06-06 (filed under the 2026-06-05 phase-22 series)
**Branch:** main
**Worktree:** C:\Users\musta\Audapp
**Mode:** PLANNING / DOCUMENTATION ONLY — no install, no uninstall, no `pnputil`, no `devgen`, no `bcdedit`, no test-signing change, no default-device change, no source changes. All script designs below are behavior/parameter contracts, **not** implementations.

**Goal:** Define the safe path for installing Audapp's `AudappChannels` driver on the user's **real Windows 10 19045 host** so daily manual testing no longer depends on the slow/unstable VM — while treating the host as high-value and non-disposable.

---

## 1. Current Project / Driver State

The separate-root-devnode architecture is validated **in the VM** (Phase 21G) and productized in the app (Phase 21H–21J).

**Driver (VM-proven):** package `AudappChannels` — `AudioChannels.inf` (`CatalogFile=AudappChannels.cat`), single service `AudappChannels` (binary `AudappChannels.sys`), four hardware IDs `ROOT\AudappGeneral | AudappMusic | AudappGame | AudappBrowser`, DeviceDesc "Audapp General/Music/Game/Browser", **render-only** (no capture interface). Phase 21G proved on the VM: four devnodes bind/start with `ProblemCode = 0` (no Code 37), four distinct + persistent Windows endpoint names, names survive disable/enable, all four pass a WASAPI Activate/GetMixFormat/Initialize/Start/Stop probe (44100 Hz, 2 ch, f32). Audapp Input and AudioMulti stayed healthy and untouched.

**App runtime (current `main`, HEAD `73e3fba`):** routing consumes only the four channels. Build health from 21J: 91 Rust tests + 62 TS tests passing, `npm run build` clean.

**Product direction:** primary flow = Audapp General / Music / Game / Browser. Audapp Input = legacy/diagnostic only (UI "Legacy" badge), not primary routing.

**Known open items inherited:** (a) **reboot persistence is still unverified even in the VM** (21G §11 deferred the reboot); (b) Windows auto-promoted a newly arrived render endpoint (Audapp Music) to system default in 21G; (c) per-app Windows endpoint switching remains a manual Volume-Mixer step.

---

## 2. Host-Install Recommendation — **AudappChannels only** (Decision D1)

Install **only** the four render channels. Do **not** install Audapp Input on the host. Do **not** install AudioMulti.

**Evidence the runtime needs only the four channels (and never Audapp Input):**
- `src-tauri/src/audio_bridge/multichannel_manager.rs:225-229` — `require_multichannel_endpoints()` errors if `general/music/game/browser` is missing; **never** checks `legacy_input`.
- `src-tauri/src/audio_bridge/multichannel_worker.rs:174-180` — the worker iterates exactly `general, music, game, browser`; Audapp Input is never referenced.
- `src-tauri/src/audio_bridge/endpoints.rs:173-220` — the physical-output resolver **explicitly rejects every Audapp endpoint** (including Audapp Input) as the sink, fail-closing to an active non-Audapp render device.
- `src-tauri/src/audio/audapp_endpoint.rs:55-60,63-74` — channels are identified by lowercased friendly-name substring (`"audapp general"` … `"audapp browser"`), locale-prefix independent; mirrored in `src/lib/audapp-endpoints.ts:22-27`.
- Audapp Input (`audapp_endpoint.rs:11-12,76-82`) and AudioMulti (`:15-16,84-90`) are classification/diagnostic only — surfaced in the `multichannel_manager.rs:199` candidate list and the UI "Legacy" badge, never in the routing critical path.

**Consequence:** removing Audapp Input from the host breaks no non-diagnostic path. The only lost function is the Audapp **microphone/capture** endpoint (the four channels are render-only). The user accepted that loss for the host. Smallest blast radius: one driver package, four devnodes, one service.

Options weighed: **A) Channels only (chosen)** — minimal surface, matches product routing. **B) Channels + Audapp Input** — adds a second package/devnode (oem19/AudioCodec) and a capture endpoint to manage and roll back; only justified if the host needs the Audapp virtual mic. **C) Defer** — block host install until Audapp Input is fully stripped from source; most conservative, keeps the user on the VM longer. Code evidence makes A safe today, so A is recommended.

---

## 3. Trust Model — **Test-signing now** (D2) + bundle `devgen` (D3)

**D2 — test-signing now.** Reuse the existing self-signed cert `CN=Audapp VM Test Code Signing` (thumbprint `C9C96275386BCDA269FE344FE805C4D668C52F86`). The installer imports the **public** cert into `LocalMachine\Root` + `LocalMachine\TrustedPublisher`, requires Windows **test-signing ON** (enabling it via `bcdedit /set testsigning on` needs a reboot), and **requires Secure Boot OFF** (test-signing has no effect under Secure Boot). Tradeoffs accepted by the user: desktop test-mode watermark and a reduced driver-trust posture on the main machine. **Production/EV (attestation) signing is the recommended long-term end-state** to retire test-signing entirely; that is a future phase, not 22x.

**D3 — bundle `devgen.exe`, do NOT require full WDK on the host.** The four devnodes are created with the WDK tool `devgen.exe`; there is no clean `pnputil` substitute for separate-root devgen devices on Win10 19041/19045. Phase 22B will copy `devgen.exe` from the **build machine's** installed WDK into `scripts/host-install/bin/`, and the installer validates its hash/signature before use. The **host needs no WDK install**. `devgen.exe` is a Microsoft WDK tool; bundling it for personal/internal host use is low-risk and is flagged as a licensing note, not a blocker.

---

## 4. Host Readiness Checklist (executed in 22D, not now)

- [ ] Save and close all work; close DAWs/audio apps and games/anti-cheat clients.
- [ ] Create a **Windows System Restore point**: `Checkpoint-Computer -Description "pre-audapp-host-install"` (requires System Protection enabled on C:).
- [ ] Recommended for a primary machine: a **full disk image** — the only true safety net if boot breaks.
- [ ] If **BitLocker** is enabled, confirm the **recovery key** is saved (Secure Boot / boot-config changes can trigger a recovery prompt).
- [ ] Confirm **Secure Boot** state (`Confirm-SecureBootUEFI`). Test-signing requires it **OFF** — a deliberate firmware change by the user.
- [ ] Confirm/accept **test-signing** implications (watermark; reduced driver-trust posture).
- [ ] Record the **current default render device** and the **full endpoint list** (so rollback restores exactly).
- [ ] Verify the **physical audio device works** right now.
- [ ] Ensure an **elevated PowerShell** is available; ensure the **repo is clean and current**; ensure ≥ a few GB free disk.

---

## 5. `Install-AudappHost.ps1` Design (contract only)

**Cross-cutting safeguards (shared by all mutating scripts):** dry-run is the **default** (`-DryRun`/`-WhatIf`); real changes require explicit **`-ConfirmHostInstall`**. Admin check (abort if not elevated). **Identity guard** on the INF reusing `build-channels.ps1` logic — abort unless exactly the four `ROOT\Audapp*` hardware IDs + `AddService=AudappChannels`, and abort if any `ROOT\AudappInput`/`ROOT\AudappMulti`/"Audapp Input"/"Audapp Multi" appears. **Print every device/package before changing it.** Log to a timestamped file under `%USERPROFILE%\Documents\Audapp\host-install-logs\`. **Stop on Code 37**, stop on **missing physical output**, and **never leave the Windows default on an Audapp endpoint** after a failed install.

Ordered steps, each gated and logged:
1. Admin + readiness gate (call the readiness logic; abort on any blocker).
2. Identity-guard the payload INF.
3. Validate payload artifact **signatures** (`.cat`/`.sys`) via `Get-AuthenticodeSignature` / `signtool verify /pa`.
4. Secure Boot OFF check; testsigning check → if OFF, **stop with instructions** to run `bcdedit /set testsigning on`, reboot, and re-run. The installer does **not** silently flip boot config.
5. Import the **public** test cert → `LocalMachine\Root` + `LocalMachine\TrustedPublisher`.
6. **Capture the current default render device** and persist it to the log for rollback.
7. `pnputil /add-driver <payload>\AudioChannels.inf` (publish to the driver store) → record the assigned `oemNN.inf`.
8. Create four devnodes via bundled `devgen.exe`: `AUDAPPGENERAL0001`, `AUDAPPMUSIC0001`, `AUDAPPGAME0001`, `AUDAPPBROWSER0001` (`/bus ROOT /hardwareid "ROOT\Audapp<Channel>"`).
9. `pnputil /add-driver ... /install` then `pnputil /scan-devices`.
10. **Verify** all four `ProblemCode = 0` (no Code 37); verify the four distinct endpoint friendly names; **WASAPI open** probe (reuse `audapp_endpoint_probe`).
11. **Reset the Windows default** back to the captured physical device (never an Audapp endpoint).
12. Write the install log + the resolved `oemNN.inf` for the uninstaller to consume.

---

## 6. `Uninstall-AudappHost.ps1` Design (contract only)

1. Admin check; **dry-run default**.
2. **List only** AudappChannels devices/packages; print them before any change.
3. Remove only `ROOT\DEVGEN\AUDAPPGENERAL0001 | AUDAPPMUSIC0001 | AUDAPPGAME0001 | AUDAPPBROWSER0001` via `pnputil /remove-device`.
4. **Resolve the published oem package dynamically** — match Original Name `audiochannels.inf` + Provider `Audapp` + Class `MEDIA` (the host assigns a different `oemNN.inf` than the VM's `oem22.inf`, so **never hardcode a number**). Then `pnputil /delete-driver <resolved-oemNN.inf> /uninstall /force`. **Abort** if the resolved name is `oem19` (Audapp Input) / `oem20`/`oem21` (AudioMulti) or anything not matching AudappChannels.
5. Never touch physical audio drivers; never delete unrelated OEM packages.
6. **Reset the default output** to a physical device.
7. Optionally clean **stale AudappChannels MMDevice endpoints**, only if provably safe.
8. Write the uninstall log. (No Audapp Input handling is required under Option A.)

---

## 7. `Test-AudappHostReadiness.ps1` + `Reset-AudappAudioDefault.ps1` Designs

**`Test-AudappHostReadiness.ps1` (read-only).** Reports and gates on: Windows build, admin status, Secure Boot state, testsigning state, presence of bundled `devgen.exe` + valid signature, System Restore availability, current default render device, full endpoint list, free disk, repo cleanliness, and payload artifact presence + **signature validity** (`Get-AuthenticodeSignature`). Exits non-zero with a clear checklist if anything blocks. Mutates nothing.

**`Reset-AudappAudioDefault.ps1` (standalone emergency tool).** Sets the Windows default render endpoint to a chosen / first-active **non-Audapp** physical device. Used by the rollback flow and by the user directly if audio gets "stuck" on a virtual endpoint.

---

## 8. Rollback / Emergency Plan

**If audio breaks but the system boots:**
1. Run `Reset-AudappAudioDefault.ps1` (restore the physical default).
2. Stop the Audapp app.
3. Run `Uninstall-AudappHost.ps1 -ConfirmHostInstall`.
4. Reboot.
5. If devices linger: Device Manager → View → Show hidden devices → remove the four AudappChannels nodes.
6. If still wrong: **System Restore** to `pre-audapp-host-install`.
7. Disable test-signing **only after** the driver is removed: `bcdedit /set testsigning off` + reboot.

Emergency one-liners (manual fallback — do not run casually; AudappChannels only):
```
pnputil /remove-device "ROOT\DEVGEN\AUDAPPGENERAL0001"   # ×4 for the four channels
pnputil /delete-driver <resolved-AudappChannels-oemNN.inf> /uninstall /force
```
Never run `delete-driver` against `oem19.inf` (Audapp Input) or `oem20/oem21.inf` (AudioMulti).

---

## 9. BSOD / Boot-Failure Plan

- Windows auto-enters **WinRE** after repeated failed boots → **System Restore** to the pre-install point (primary path).
- Or boot **Safe Mode**; resolve the AudappChannels oem first, then `pnputil /delete-driver <oemNN.inf> /uninstall /force`, and remove the four devnodes in Device Manager.
- From the **WinRE command prompt**, the offline driver store can be cleaned with `dism /image:C:\ /remove-driver <oemNN.inf>` if needed.
- The **full disk image** (readiness step) is the guaranteed recovery if all else fails.
- Have the **BitLocker recovery key** ready in case Secure Boot / boot-config changes prompt for it.

This is realistic but low-probability: the driver is minimal and VM-validated; the most likely failure mode is "no/odd audio," recovered by uninstall + default reset, not a BSOD.

---

## 10. VM-to-Host Staged Path

| Phase | What | Mutates? |
|---|---|---|
| **22A** | This plan → spec + report docs | No |
| **22B** | Implement the four scripts + README + bundle `devgen.exe` + stage signed payload | Repo only |
| **22C** | Run the scripts **in the VM from a clean snapshot**; close the open gap by **verifying reboot persistence**; prove uninstall is clean | VM only |
| **22D** | Execute the **host readiness checklist** (restore point, image, record defaults, Secure Boot decision) | Host prep only |
| **22E** | Host install attempt with `-ConfirmHostInstall`; verify; reset default; keep uninstall ready | Host (gated) |

**22E is gated on 22C passing**, including reboot persistence.

---

## 11. User Downloads

- **For 22A: nothing.**
- **For host install (22E):** nothing beyond the repo **if** 22B bundles `devgen.exe` and stages the signed package + public `.cer` under `scripts/host-install/`. The **build machine** still needs the WDK to (re)build/sign the package; the **host does not**. A full WDK install on the host is explicitly avoided.

---

## 12. Risk Table

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

## 13. Phase 22B Build Plan

1. Create `scripts/host-install/` with the four scripts + `README.md`.
2. Implement a shared safeguard module (admin / dry-run / identity-guard / logging), reusing `build-channels.ps1` identity logic.
3. Bundle `devgen.exe` into `bin/`; add hash/signature validation.
4. Stage the signed package (`AudappChannels.sys`/`.cat`, `AudioChannels.inf`, public `.cer`) into `payload/` from the `Audapp-21B` build output (or a fresh rebuild + sign on the build machine).
5. Dry-run all four scripts (no mutation); unit-check the oem-resolution + identity-guard logic.
6. Hand off to 22C (VM validation incl. reboot persistence).

Proposed layout:
```
scripts/host-install/
  Install-AudappHost.ps1
  Uninstall-AudappHost.ps1
  Test-AudappHostReadiness.ps1
  Reset-AudappAudioDefault.ps1
  README.md
  bin/devgen.exe            # bundled from WDK (22B)
  payload/                  # AudappChannels.sys/.cat, AudioChannels.inf, public .cer
```

---

## 14. Final Recommendation

Proceed on the **AudappChannels-only + test-signing-now** path. Build the host-install scripts in **22B**, **validate them in the VM in 22C (closing the reboot-persistence gap)**, run the **22D readiness checklist**, then attempt the **gated 22E host install**. Do not skip 22C. Production/EV signing is the recommended long-term exit from test-signing.

See the companion report: `docs/superpowers/reports/2026-06-05-audapp-phase-22a-host-install-safety-report.md`.
