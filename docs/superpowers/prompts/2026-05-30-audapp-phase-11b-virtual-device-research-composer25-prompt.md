# Audapp — Phase 11B Virtual Device Research / Isolated Driver Scaffold — Composer‑2.5 Prompt

## Metadata

- **Target Thread:**
  ```text
  Audapp — Phase 11B Virtual Device Research / POC
  ```
- **Target Agent:**
  ```text
  Composer-2.5
  ```
- **Suggested Mode:**
  ```text
  Research mode (with light scaffold writing — docs + non-compiled skeleton only)
  ```
- **Suggested Domain Focus:**
  - `windows-audio`
  - `wdk`
  - `sysvad`
  - `virtual-audio-devices`
  - `driver-architecture`
  - `rust`
  - `tauri-app-architecture`
  - `security-review`
  - `documentation`
- **Project Name:**
  ```text
  Audapp
  ```
- **Project Path:**
  ```text
  C:\Users\mustafa\Audapp
  ```

---

## Context

You are working on **Audapp**, a Windows desktop audio control app (Rust + Tauri v2 + React +
TypeScript + shadcn/ui + Tailwind + `windows-rs`).

Audapp already has a working **Routing Lab**: a single‑threaded WASAPI duplex worker
(`src-tauri/src/audio_engine/routing/`) that captures from a selected `eCapture` device, runs a
real‑time‑safe per‑channel DSP/EQ chain (`DspPipeline::process_routing_sample`, shared with the
Equalizer page), buffers through a preallocated ring, and renders to a selected physical output.
Today the **only** dependency on a third party is the *capture source*: the user must manually route
app audio through VB‑CABLE / Voicemeeter.

**Phase 11A** (`docs/superpowers/specs/2026-05-30-audapp-phase-11a-virtual-audio-device-architecture-plan.md`)
concluded that Audapp‑owned virtual endpoints require a **kernel‑mode audio driver** (target **ACX**,
using the **SYSVAD** virtual‑audio pattern as reference) — there is no supported user‑mode‑only way to
register a Windows audio endpoint. The driver is the correct long‑term end state but is high‑risk, so it
must be staged.

**Phase 11B is the first, safest driver step: research + an isolated, NON‑COMPILED scaffold.**

---

## Composer Scope

**Read first:** `docs/superpowers/specs/2026-05-30-audapp-phase-11a-virtual-audio-device-architecture-plan.md`.

**Do:**
- Research and document the **WDK/EWDK + Visual Studio 2022** prerequisites, Spectre‑mitigated libs,
  test‑signing setup (`bcdedit /set testsigning on`, self‑signed cert), and a **VM/disposable
  test‑machine** workflow for any future driver install.
- Record the **SYSVAD vs ACX decision** with rationale (Phase 11A recommends **ACX**, with SYSVAD as the
  structural reference for a virtual‑audio device).
- Design the **driver ↔ app communication transport**: POC = buffered IOCTL polling (mirrors the current
  duplex polling model); production target = kernel‑allocated shared‑memory ring + event signaling.
  Document RT‑safety, latency, complexity, permissions, and reliability trade‑offs.
- Create an **isolated, build‑excluded in‑repo `driver/` folder** containing **documentation and a
  non‑compiled skeleton only** (README, folder structure, design notes, transport spec, prerequisites,
  uninstall/recovery notes). Ensure the `driver/` folder is **excluded from the cargo/Tauri build** and
  is not referenced by the app.
- Produce an explicit **go/no‑go recommendation for Phase 11C** (the compile‑only "Audapp Input" endpoint).

**Do NOT:**
- Do **not** compile a driver.
- Do **not** install a driver or anything else, and do **not** require admin/elevation.
- Do **not** modify any working app behavior.
- Do **not** touch the **Routing Lab / DSP / EQ / Engine Lab / Mixer / Apps / Devices** code.
- Do **not** implement APO, system‑wide EQ, or automatic per‑app routing.
- Do **not** add driver dependencies to the cargo/Tauri build.

---

## Composer Acceptance Criteria

- **No driver compiled or installed**; **no admin/elevation** required; **nothing installed**.
- **No app behavior change.** Routing Lab, Engine Lab, Equalizer, Mixer, Apps, Devices all still work;
  DSP/EQ persistence intact.
- WDK/EWDK + Visual Studio prerequisites documented; VM, test‑signing, and recovery/uninstall steps documented.
- **SYSVAD vs ACX decision recorded**; **driver↔app transport design recorded** (IOCTL POC → shared‑mem
  production).
- An **isolated `driver/` scaffold** exists (docs + skeleton only), **excluded from the cargo/Tauri
  build**, **not compiled**.
- An explicit **go/no‑go** recommendation for Phase 11C is written down.
- `cargo check`, `cargo test`, and `npm run build` (incl. `tsc`) still pass.

---

## Composer Final Response Format

Report exactly:
1. **What was created or researched.**
2. **Files changed** (full list).
3. **Whether any driver code was created** (and confirm none was compiled).
4. **Whether anything was installed** (expected: nothing).
5. **Prerequisites** (WDK/EWDK, VS, test signing, VM, signing/cert for later).
6. **Risks / blockers.**
7. **Recommended next phase** (go/no‑go for Phase 11C).

---

## Very Short Summary

This prompt runs Audapp Phase 11B: a safe **research + isolated scaffold** step toward an Audapp‑owned
virtual audio driver. Composer‑2.5 documents the WDK/ACX prerequisites and the driver↔app transport
design, decides SYSVAD vs ACX, and creates a **non‑compiled, build‑excluded `driver/` folder** — with
**no driver compiled, nothing installed, and no changes to the working app** — ending in a go/no‑go for
the Phase 11C compile‑only "Audapp Input" endpoint.
