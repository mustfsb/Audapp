# Audapp — Phase 11A: Virtual Audio Device / Driver Architecture Plan

**Date:** 2026-05-30
**Phase:** 11A (planning only — no source code, no driver, no installs)
**Project:** Audapp — Windows desktop audio control app (Rust + Tauri v2 + React + TypeScript + shadcn/ui + Tailwind + `windows-rs`)
**Path:** `C:\Users\mustafa\Audapp`

> **Purpose.** Audapp can already process app audio, but only when the user **manually** routes that
> audio through a third‑party virtual cable (VB‑CABLE / Voicemeeter). This document plans the safest
> realistic path to **Audapp‑owned virtual audio devices** that apps can select directly, removing the
> third‑party dependency. It compares every viable Windows strategy, recommends a long‑term
> architecture, and defines the next safe phase (11B). **No driver is built or installed here.**

> **Confirmed decisions for this plan:**
> - **Phase 11B = research + isolated driver scaffold spike** (no compile, no install).
> - **Driver project lives in an isolated, build‑excluded in‑repo `driver/` folder.**
> - **Distribution: document both signing paths (test‑signed/dev‑only and EV‑cert + Microsoft
>   attestation), defer the signing cost.**

---

## 0. Core Technical Finding (drives this entire plan)

A **real** Windows audio endpoint that arbitrary applications can select as their output (or input)
can only be created by a **kernel‑mode audio driver** — either the classic PortCls/WaveRT miniport
model used by Microsoft's **SYSVAD** virtual‑audio sample, or the newer WDF‑based **ACX (Audio Class
eXtension)** framework Microsoft now recommends for new audio drivers.

There is **no supported user‑mode‑only API** for a normal Tauri/Rust application to register a system
audio endpoint. The honest user‑mode alternatives are **capture‑only**:

- **WASAPI loopback** — capture the *mix already playing* on an existing render endpoint. No install,
  but it captures the whole endpoint (not a specific app) and feeds back if you render to the same device.
- **Per‑process loopback** (`ActivateAudioInterfaceAsync` + `AUDIOCLIENT_ACTIVATION_PARAMS` /
  `PROCESS_LOOPBACK`, Windows 10 2004+) — capture *one process tree's* audio in user mode, no driver,
  no cable. This is the modern user‑mode option. **Caveat:** it captures a *copy*; the app still plays
  to the real device, and muting the source to avoid double audio also silences the loopback copy. It
  therefore enables "process app X to a different output," not a clean transparent redirect.

**APO** (Audio Processing Object) is a user‑mode COM DLL loaded into the Windows audio engine to
*process* an existing endpoint's stream. It does **not** create endpoints and does **not** route between
devices. It is the path to system‑wide EQ, not to owned virtual devices.

**Conclusion:** Owned virtual endpoints require a kernel driver. The driver is the correct long‑term end
state, but it is high‑risk (signing, admin, BSOD) and must be **staged**, not implemented now.

---

## 1. Current State Findings

Verified by reading the repository (`src-tauri/src/audio_engine/**`, `src-tauri/src/audio/**`, `src/**`,
`tauri.conf.json`).

### Routing Lab — the foundation to reuse (`src-tauri/src/audio_engine/routing/`)
- **`manager.rs`** — an **isolated** global `OnceLock<Mutex<RoutingManager>>` with a single duplex worker
  thread and `routing_start / routing_stop / routing_status / routing_shutdown`. It refuses to start
  while the Engine Lab worker is active (both drive the shared DSP status flags), spawns a named thread,
  uses a `stop_flag`, joins on stop, and has a 2 s graceful shutdown wired to the window `Destroyed`
  event in `lib.rs`. It does **not** repurpose the single‑mode `EngineManager`.
- **`duplex.rs`** — a single‑threaded WASAPI duplex worker. It opens a selected **`eCapture`** device and
  a selected **`eRender`** device in **shared mode** (`AUDCLNT_SHAREMODE_SHARED`, 20 ms buffer), drains
  capture packets (`GetNextPacketSize` / `GetBuffer` / `ReleaseBuffer`) into a ring, then per render
  cycle pulls frames, applies DSP **per channel** via `DspPipeline::process_routing_sample`, maps
  channels, and writes to `IAudioRenderClient`. Supports **f32 + i16 only**, **no sample‑rate
  conversion** (requires equal capture/render rates), and drives both clients with
  `sleep(half_buffer_period)` polling (no event‑driven WASAPI).
- **`ring.rs`** — a preallocated interleaved `F32Ring` (~200 ms cushion), with underrun/overrun counters
  and **no allocation in the hot path**.
- **`safety.rs`** — runs **before** the worker starts: blocks identical capture/render device (feedback),
  enforces equal sample rate, restricts to f32/i16, provides mono↔stereo up/down‑mix helpers
  (`sample_for_output_channel`), and emits a "use a virtual cable (VB‑CABLE/Voicemeeter)" hint.
- **`types.rs`** — `RoutingConfigInput` and `AudioRoutingRuntimeStatus` (state, device ids, sample rate,
  in/out channels, buffer frames, estimated latency, ring fill %, underrun/overrun/glitch counts,
  peak/rms, warning, last_error).

### DSP / EQ — reusable and shared
- `DspPipeline::process_routing_sample(x, channel_index)` = **gain → HP → EQ → LP → limiter**, per
  channel, reusing preallocated states. It reads `audio_engine/dsp/config::global()` — lock‑free atomics
  in a `OnceLock`, version‑gated via `maybe_refresh()` once per buffer cycle — and is **shared with the
  Equalizer page**, so EQ/DSP edits affect routed audio live. No heap/locks/logging in the per‑sample path.

### Commands, discovery, lifecycle
- `audio_engine_commands.rs`: `start_audio_routing`, `stop_audio_routing`, `get_audio_routing_status`
  (plus the engine/DSP commands), all registered in `lib.rs::invoke_handler!`; `routing_shutdown()` runs
  on window `Destroyed`.
- `audio_engine/format.rs::probe_device_formats()` enumerates `eRender` + `eCapture` active endpoints
  with their mix format. **A future Audapp driver endpoint would appear here automatically** — discovery
  needs no change.
- `src/components/routing/routing-lab-view.tsx` is the wired UI; navigation is the `SectionId` union
  (`types/audio.ts`) + `App.tsx` + `sidebar.tsx`.

### Distribution posture today
- `tauri.conf.json`: `bundle.targets:"all"`, identifier `com.audapp.desktop`, **no code‑signing config,
  no driver, no admin/elevation.** Fully user‑mode, reversible, opt‑in.

### Net gap & the key reuse insight
The Voicemeeter/virtual‑cable dependency exists **only** at the *capture source*. Everything downstream —
the ring buffer, the per‑channel DSP/EQ, the render path, the status reporting, the graceful shutdown —
is already built and real‑time‑safe. **A future driver only has to replace the capture source** with an
Audapp‑owned endpoint that hands its audio to the app. The rest of the pipeline is unchanged.

---

## 2. Virtual Device Strategy Comparison

| Strategy | Feasible now | Eng. complexity | Latency risk | CPU/RAM | User setup | Signing / admin / install | Long‑term fit | Recommended timing |
|---|---|---|---|---|---|---|---|---|
| **A. External virtual cable / Voicemeeter** (current) | **Yes** — cable output is an `eCapture` device the duplex worker already handles | Low (already built) | Med (polling + ~200 ms ring) | Low | Med (install cable, route once) | None | Good *bridge*, not a product end state | **Keep as fallback; replace over time** |
| **B. WASAPI loopback capture** | Yes — needs `AUDCLNT_STREAMFLAGS_LOOPBACK` on an `eRender` endpoint | Med | Med–High | Low | **Low (no install)** | None | "Process Spotify/system without a cable" | **Phase 10C (parallel, near‑term)** |
| **B′. Per‑process loopback** (`PROCESS_LOOPBACK`, Win10 2004+) | Yes (user mode, no driver/cable) | Med–High | Med | Low | Low | None | Per‑app capture without a driver; cannot transparently redirect (captures a copy) | **With 10C, parallel track** |
| **C. Custom Audapp virtual audio driver** (SYSVAD/ACX) — owned `eRender`/`eCapture` endpoints apps select directly | **No (not yet)** | **Very high** — kernel driver, ACX/PortCls, driver↔app transport, signing, installer, admin | Low (kernel) | Low | High (install + signed driver) | **EV cert + Microsoft attestation/WHQL; admin install; test signing for dev** | **Ideal end state** | **Staged: 11B research → 11C compile‑only → 11D bridge → 11E integrate** |
| **D. APO / system effect** | No (for routing) | High — APO COM, MMDevice property‑store registration, strict format/threading, can break endpoint audio | Low | Low | High | Packaging/registration; admin | System‑wide EQ end state (processing, **not** routing) | **Deferred** |
| **E. User‑mode‑only endpoint** | **No** — unsupported on Windows | — | — | — | — | — | — | **Not possible; documented honestly** |

**Why staged C over jumping to a driver now.** Strategy C is the only one that yields true Audapp‑owned
endpoints (the product goal), but it adds kernel‑mode, signing, installer, and admin surface that — if
wrong — can destabilize **system‑wide** audio (BSOD). It must be de‑risked through a research spike and
compile‑only milestones first. Strategies B/B′ deliver **cable‑free value now** with zero driver risk and
should run in parallel.

---

## 3. Recommended Long‑Term Architecture

```
App selects "Audapp Input" as its output endpoint
        │   (Audapp‑owned virtual render endpoint — kernel driver)
        ▼
Audapp virtual audio driver (ACX, SYSVAD virtual‑audio pattern)
        │   driver ↔ app transport (POC: buffered IOCTL; prod: shared‑mem ring + events)
        ▼
Audapp user‑mode app  ──►  existing duplex/ring  ──►  process_routing_sample (DSP/EQ/Mixer)
        ▼
Selected physical output device (WASAPI render — already built)
```

- **First device: a single `Audapp Input` render endpoint.** Apps route to it; Audapp processes and
  re‑renders to the chosen physical output. This maps onto the existing duplex/DSP/render pipeline with
  the *capture source* swapped from a Voicemeeter cable to the driver endpoint.
- **Multi‑device future (Phase 12A):** `Audapp Game / Chat / Music / Browser / System / Mic` as separate
  endpoints/channels feeding the Mixer. **Deferred** — start with one device to bound risk.
- **Framework recommendation:** target **ACX** (Microsoft's current, WDF‑based audio driver model) and
  use the **SYSVAD virtual‑audio sample as the structural reference**. SYSVAD is the canonical
  virtual‑audio device; ACX reduces boilerplate and is the supported forward path.

---

## 4. First Minimal Virtual Device POC

**Target shape:**

```
One Audapp virtual render endpoint: "Audapp Input"
→ apps can select it as output
→ Audapp receives its audio stream (via the driver↔app transport)
→ Audapp sends it through the existing Routing/DSP engine
→ Audapp renders to the selected physical output
```

**Staging within the driver work (keep each step tiny):**
- **11C (compile‑only):** create the `Audapp Input` endpoint and verify it (a) appears in Windows sound
  settings + `probe_device_formats()`, and (b) accepts audio (render‑to‑null inside the driver). **No
  transport yet.** Local install only behind explicit approval, test‑signed, on a VM/test machine.
- **11D:** wire the driver↔app transport so the audio written to `Audapp Input` reaches the Audapp app.
- **11E:** feed that stream into the existing duplex/DSP/render path (the capture source becomes
  `Audapp Input` instead of a Voicemeeter cable).

If 11C still proves too large for one build, fall back to a **deeper research spike** before any compile.

---

## 5. Driver ↔ App Communication Plan

| Transport | RT‑safety | Latency | Complexity | Permissions | Reliability | POC fit |
|---|---|---|---|---|---|---|
| **Shared‑memory ring** (kernel‑allocated, mapped to user mode) + event signaling | Best | Lowest | **High** (MDLs, mapping, lifetime) | Driver + app | High once correct | Production target, not first POC |
| **Buffered IOCTL** read/write (`DeviceIoControl`, overlapped) | Good | Med (per‑call overhead) | **Low–Med** | Standard handle | High | **Recommended for POC** — mirrors today's polling model |
| **Named pipe** | OK | Med | Med | App‑level | Med | Poor from a kernel driver; only via a user‑mode helper |
| **Kernel streaming / AVStream** | Best | Low | **Very high** | Driver | High | Too heavy for a POC |
| **User‑mode service helper** (owns the driver handle, bridges to the app) | Good | Med | Med–High | Service install | High; survives app restarts | Optional later; adds an install/service component |

**Recommendation:** **POC = buffered IOCTL polling** (matches the existing `sleep(half_buffer_period)`
duplex model and needs no kernel/user memory mapping). **Production = kernel‑allocated shared‑memory ring
with event signaling** for low‑latency, glitch‑free transport. A user‑mode service helper is an optional
later refinement if the driver handle should outlive the Tauri app.

---

## 6. Development Environment / Tooling Plan

**Needed for driver work (Phase 11C onward — not 11B):**
- Windows 11 (already in use).
- Visual Studio 2022 + Build Tools (or the **EWDK** — Enterprise WDK, self‑contained).
- **Windows Driver Kit (WDK)** matching the installed Windows SDK version.
- Spectre‑mitigated runtime libraries (WDK build requirement).
- **A Hyper‑V VM or disposable test machine** for installing/loading the driver — never the primary dev box.
- **Test signing mode** for dev (`bcdedit /set testsigning on` — requires reboot, shows a desktop
  watermark) + a self‑signed test certificate.
- For distribution (**deferred, see §7**): an **EV code‑signing certificate** + a Microsoft Partner Center
  hardware dev account for **attestation signing** (or full WHQL). Admin elevation to install.

**Repo layout:** the driver lives in an **isolated, build‑excluded in‑repo `driver/` folder**. The
cargo/Tauri build must **never** depend on or compile it. A separate `audapp-driver` repo is noted as a
future option if/when the signing pipeline warrants it. Phase 11B creates only **docs + a non‑compiled
skeleton** in `driver/`.

---

## 7. Security / Stability / UX Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Kernel driver bug | **BSOD / system audio instability** | Isolated `driver/`; VM/test‑machine only; staged compile‑only milestones; go/no‑go gates |
| Audio stack instability | Other apps lose audio | Test in VM; never auto‑install; provide clean uninstall |
| Driver signing | Cannot distribute unsigned | Test‑signing for dev; document EV + attestation path; **defer cost** |
| SmartScreen / AV perception | Users distrust a driver + installer | Signed installer later; clear UX copy; reputable cert |
| Admin elevation | Friction, trust | Required only for install/uninstall, never for normal app use |
| Uninstall / rollback / system restore | Users stuck if driver misbehaves | Ship uninstall + recovery docs from the first compile‑only POC |
| Latency / glitches | Poor audio | Shared‑mem ring + events for production; report metrics as today |
| Cross‑Windows‑version support | Breakage across updates | ACX (supported model); test matrix; staged rollout |
| Support burden | Driver issues are hard to debug remotely | Strong logging/diagnostics; keep the user‑mode loopback fallback |

---

## 8. Recommended Phase Breakdown

```
Phase 11B  Driver research + ISOLATED scaffold spike   ← NEXT (no compile, no install)
Phase 11C  Compile‑only "Audapp Input" endpoint        (render‑to‑null; optional local test‑signed install, explicit approval only)
Phase 11D  Driver ↔ user‑mode audio bridge             (transport: buffered IOCTL)
Phase 11E  Routing Lab integration                     (Audapp Input as capture source in the existing duplex/DSP path)
Phase 12A  Multi‑device channels                       (Game/Chat/Music/Browser/System/Mic → Mixer)
Phase 12B  Installer + signing                         (EV cert, attestation, packaged installer, uninstall/rollback)

Parallel user‑mode track (near‑term, no driver):
Phase 10C  WASAPI loopback + per‑process loopback      (cable‑free "process my audio" value)
```

---

## 9. What Phase 11B Should Do

**Decision: Option 1 — Research + isolated driver scaffold spike.**

Deliverables:
- Research docs: WDK/EWDK + Visual Studio prerequisites, install/test‑signing steps, VM/test‑machine setup.
- **SYSVAD vs ACX decision** recorded with rationale (recommend ACX, SYSVAD as reference pattern).
- **Driver↔app transport design** documented (POC IOCTL → production shared‑mem ring).
- An **isolated, build‑excluded `driver/` skeleton** (folder + README + placeholder structure) — **not
  compiled, not installed.**
- An explicit **go/no‑go** recommendation for the Phase 11C compile‑only POC.

Hard constraints: **no driver compiled, no driver installed, no admin/elevation, no app behavior change,
no changes to the Routing Lab / DSP / Engine Lab, no APO / system‑wide EQ / automatic routing.**

The **WASAPI loopback / per‑process loopback** work (10C) is recommended as a **parallel** near‑term track
for cable‑free user value, but Phase 11B itself stays the driver research spike.

---

## 10. Acceptance Criteria for Phase 11B

- **No driver compiled or installed** by default; **no admin/elevation** required.
- **No app behavior change**; Routing Lab, Engine Lab, Equalizer, Mixer, Apps, Devices all still work;
  DSP/EQ persistence intact.
- WDK/EWDK + VS prerequisites documented; VM/test‑signing/recovery steps documented.
- **SYSVAD vs ACX decision** recorded; **driver↔app transport design** recorded.
- An **isolated `driver/` scaffold** created (docs + skeleton only, **excluded from the cargo/Tauri
  build**, not compiled).
- An explicit **go/no‑go** for Phase 11C.
- `cargo check`, `cargo test`, and `npm run build` (incl. `tsc`) still pass.

---

## 11. Risks & Deferrals

**Deferred:** multi‑device Game/Chat/Music/Browser/System/Mic endpoints; installer; EV/attestation
signing (cost deferred); APO / system‑wide EQ; automatic per‑app routing; production virtual device;
multi‑channel bus; noise suppression; sample‑rate conversion; event‑driven WASAPI; shared‑memory
transport (until 11D+); user‑mode service helper.

**Top risks:** kernel‑driver BSOD/system‑audio instability (→ isolation + VM + staged go/no‑go); signing
cost/complexity (→ document both paths, defer); user trust around a driver+installer (→ signed installer
later, honest UX copy). The **user‑mode loopback fallback** remains available throughout, so the product
is never blocked on the driver.

---

## Next step

**Phase 11B deliverables** (research + isolated driver scaffold — no compile, no install) live in
[`driver/README.md`](../../../driver/README.md) with supporting docs under `driver/docs/`.

Hand the companion prompt
`docs/superpowers/prompts/2026-05-30-audapp-phase-11b-virtual-device-research-composer25-prompt.md`
to **Composer‑2.5** to execute Phase 11B (research + isolated driver scaffold — no compile, no install).
