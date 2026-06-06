# Audapp — Phase 21A Multi-Endpoint Driver Architecture Report

**Date:** 2026-06-04
**Phase:** 21A — Multi-Endpoint Driver Architecture (planning only)
**Branch:** `main`
**Companion spec:** `docs/superpowers/specs/2026-06-04-audapp-phase-21a-multi-endpoint-driver-architecture-plan.md`

This phase was plan-only. No driver, INF, source, signing, install, `devgen`, `pnputil`, or `bcdedit` operations were performed.

---

## 1. Driver Preflight Result

All read-only checks passed; baseline matches expectations exactly:

- `devcon status @ROOT\DEVGEN\AUDAPP12G0001` → **Driver is running**
- `devcon stack` → Class **MEDIA**, upper filter `ksthunk`, service **AudioCodec**
- `Get-PnpDevice` → `Audapp Input`, Status **OK**, Class **MEDIA**
- `DEVPKEY_Device_ProblemCode` = **0**; `ProblemStatus` empty; `DriverInfPath` = **oem19.inf**

**Driver health: OK. No remediation needed or attempted.**

## 2. Current Scaffold Findings

- Scaffold is the Microsoft **ACX AudioCodec** sample. Active build path creates **one** render + **one** capture circuit on a single root device (`Codec_EvtBusDeviceAdd` → `CodecR_AddStaticRender` + `CodecC_AddStaticCapture`).
- `Common/RenderCircuit.cpp::CodecR_CreateRenderCircuit` is already **parameterized by component GUID and circuit name** — a multi-render loop is a small additive change.
- `shared/Public.h` already **declares** richer upstream multi-circuit contexts (`DSP_DEVICE_CONTEXT` = Speaker + SpeakerHp + HDMI render + MicArray + MicrophoneHp capture; `CODECMC`/`DSPMC` with composites/factory circuits; `RenderMC_AddStaticRender` carrying a per-endpoint `Uri`). Their `.cpp` bodies are **not** present in this scaffold but prove the pattern is sample-supported.
- `AudioCodec.inf` defines a single render endpoint (`Speaker0`) + single capture (`Microphone0`) under `ROOT\AudappInput`; per-endpoint FriendlyName comes from each interface's `AddReg`.
- App discovery (`audio/devices.rs`) uses `IMMDeviceEnumerator`; Audapp matching already uses the **localization-independent** `contains("audapp")` substring — not the `Hoparlör` prefix.

## 3. ACX Topology Assessment

- One ACX device **can** host multiple render circuits → multiple MMDevice endpoints. The hard part is **not** the C++ (trivial parameterized loop) but the **INF↔circuit FriendlyName binding** for N endpoints, for which the upstream DSP sample INF is the reference.

## 4. Recommended Multi-Endpoint Architecture

**Option A** (single root device, four render circuits General/Music/Voice/Game) as the *target topology*, sequenced under **Option D** safety discipline (separate-identity experimental package, VM-only install), with **Option C** (current single endpoint + user-mode channels) remaining the **live default until VM-proven**. Capture stays single for now.

## 5. Risk Rating

- Phase 21B (compile-only): 🟢 low overall (no load; main task is resolving INF binding statically).
- Phase 21C (VM install): 🔴 on Code 37 / endpoint-visibility / BSOD — fully mitigated by mandatory snapshot, separate package identity, and stop-on-Code-37.
- Live `Audapp Input` stack: 🟢 unaffected by this plan (new package gets a new hardware ID; `oem19.inf` untouched).
- Top watch items: preserve **ACX 1.0** (1.1 → Code 37 on this box), prove the 4-endpoint INF binding, never collide with `ROOT\AudappInput`.

## 6. Should Phase 21B Proceed?

**Yes — proceed to Phase 21B (compile-only) under strict worktree/package isolation.** Pause before 21C (VM-only, separately approved). The live product remains on Option C in the meantime, so adopting this plan carries no risk to the current stable stack.

## 7. Files Written

- `docs/superpowers/specs/2026-06-04-audapp-phase-21a-multi-endpoint-driver-architecture-plan.md`
- `docs/superpowers/reports/2026-06-04-audapp-phase-21a-multi-endpoint-driver-architecture-report.md` (this file)

No source, driver, or INF files were modified.

## 8. Commands Run (all read-only / health / repo-health)

- `git status --short`, `git branch --show-current`, `git log --oneline -5`
- `devcon status` / `devcon stack` for `@ROOT\DEVGEN\AUDAPP12G0001`
- `Get-PnpDevice` / `Get-PnpDeviceProperty` (ProblemCode, ProblemStatus, DriverInfPath)
- `cargo check --manifest-path src-tauri\Cargo.toml` → **exit 0** (warnings only)
- (`npm run build` not run; cargo health deemed sufficient for a plan-only phase)

## 9. Verification

- Driver state remained OK throughout (no driver operations performed).
- `cargo check` passed (exit 0, 28 warnings, no errors).

## 10. Current Git Status

`main`; working tree adds the two Phase 21A docs above plus the pre-existing untracked Phase 23A report. No tracked files modified.

## 11. Exact Next Step

Await user decision. If approved, **Phase 21B (compile-only)**: create an isolated worktree, copy the scaffold to a separate-identity `audapp-multi` package, implement the four-render-circuit array + four-endpoint INF, and compile/stage only — no install, no `devgen`, no `pnputil`, no `bcdedit`. Resolving the INF↔endpoint binding (spec §8 Task 6, Known Unknown #1) is the central goal of 21B.
