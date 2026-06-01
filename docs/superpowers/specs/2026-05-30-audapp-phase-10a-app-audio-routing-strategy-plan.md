# Audapp — Phase 10A: App Audio Routing / Virtual Device Strategy Plan

**Date:** 2026-05-30
**Phase:** 10A (planning only — no source code)
**Project:** Audapp — Windows desktop audio control app (Rust + Tauri v2 + React + TypeScript + shadcn/ui + Tailwind + `windows-rs`)
**Path:** `C:\Users\mustafa\Audapp`

> **Purpose.** Audapp's DSP/EQ currently processes only its own Engine Lab test audio. It cannot yet process Spotify, Discord, games, browser, or system-wide audio. This document plans the **first real app-audio routing path** and recommends the safest next build phase (10B) — without building a custom driver or APO yet.

> **Confirmed product decisions for 10B:**
> - UI: a **new dedicated "Routing Lab" page** (new `SectionId "routing"`), kept separate from the test-only Engine Lab.
> - Capture scope: **`eCapture` endpoints only** (virtual-cable outputs such as VB-CABLE "CABLE Output", Voicemeeter, and real microphones). **WASAPI loopback capture is deferred** to a later phase (10C).

---

## 1. Current State Findings

Verified by reading the repository (`src-tauri/src/audio_engine/**`, `src-tauri/src/audio/**`, `src/**`).

### Discovery & session control
- `src-tauri/src/audio/` (separate from `audio_engine/`) provides real Core Audio device + session discovery, session volume/mute control, channel-assignment persistence, and mixer-settings persistence. Mixer and Apps pages are **local control only** — no audio flows through Audapp today.
- `src-tauri/src/audio_engine/format.rs::probe_device_formats()` enumerates `eRender` + `eCapture` `DEVICE_STATE_ACTIVE` endpoints, returning friendly name + mix format (sample rate, channels, bits, `is_float`). **Virtual cables already appear here as normal endpoints.**

### Engine Lab (WASAPI) — `audio_engine/manager.rs` + `wasapi.rs`
- **Single worker, single mode.** `EngineManager { worker: Option<WorkerState> }` is a global `OnceLock<Mutex<…>>`; `engine_start` returns `AlreadyRunning` if a worker already exists. Each run executes exactly one `EngineMode`.
- `EngineMode`: `None | RenderSilence | RenderTestTone | CaptureMeter | CaptureToNull`. `is_capture = CaptureMeter | CaptureToNull`.
- The worker (`run_wasapi_stream`) runs on its own thread in COM **MTA**, opens **one** device by ID (`enumerator.GetDevice(&HSTRING)`) or the default endpoint, `Activate::<IAudioClient>`, `GetMixFormat`, `Initialize(AUDCLNT_SHAREMODE_SHARED, 0, 200_000 /*20 ms*/, 0, mix_fmt, None)`.
- **Render path** (`run_render_loop`): synthesizes a tone (`ToneGenerator`), applies the **output** DSP chain via `process_render_mono`, writes to `IAudioRenderClient`. `RenderSilence` sets the silent buffer flag.
- **Capture path** (`run_capture_loop`): reads `IAudioCaptureClient` packets, applies **input** DSP while computing peak/RMS (`compute_peak_rms_f32_dsp`), then **discards the audio** on `ReleaseBuffer`. **Nothing routes capture → render.**
- **Polling model:** both loops `std::thread::sleep(half_buffer_period)` (~10 ms for a 20 ms buffer). No event-driven `SetEventHandle`.
- **Format handling:** supports **f32** and **i16**; any other format → silence/zero. **No sample-rate conversion.**

### DSP / EQ — `audio_engine/dsp/`
- `pipeline.rs::DspPipeline` is the reusable core: preallocates per-channel biquad states in `prepare()`; **no heap allocation, no locks, no logging in the per-sample hot path**. `maybe_refresh()` reads the shared atomic config once per buffer cycle (version-gated) and recomputes coefficients only on change.
  - `process_render_mono(x)` → output_gain → HP → EQ → LP → **limiter** (mono only).
  - `process_capture_sample(x, ch)` → input_gain → HP → EQ → LP (**no limiter**, per channel).
- `config.rs::DspConfigShared` — lock-free atomics in a `OnceLock` global; `version` bumped on every write for cache invalidation. Holds gains, HP/LP, limiter, 5 EQ bands, plus engine-reported status (`active_in_engine`, `supported`, `sample_format_tag`). **Shared by both Engine Lab and the Equalizer page** — any routing path that reuses this config inherits live EQ updates for free.
- 5-band peaking EQ (`eq.rs`), HP/LP (`filters.rs`), soft limiter (`limiter.rs`, stateless `soft_limit`), presets (`presets.rs`), persistence (`persistence.rs`, loaded + applied on Tauri `setup`).

### Commands & lifecycle
- `audio_engine_commands.rs`: `get_audio_engine_runtime_status`, `get_audio_device_formats`, `start_audio_engine_test`, `stop_audio_engine_test`, `get/set/reset_dsp_config`, `get_dsp_status`, `set_dsp_eq_preset`.
- `lib.rs`: all commands registered in `invoke_handler!`; DSP config loaded + applied on `setup`; `engine_shutdown()` runs on window `Destroyed` (2 s graceful deadline).

### Frontend — `src/`
- Navigation = `SectionId` union (`types/audio.ts`) + `navigation[]` and a `content` record in `app/App.tsx` + an `icons: Record<SectionId, ElementType>` in `components/layout/sidebar.tsx`. Adding a page = extend all three.
- `components/engine/engine-lab-view.tsx` is the UI template: device `Select`s fed from discovery, `useAudioEngine()` (start/stop + 2 s status poll), `useAudioDsp()` + `<DspControls>`.
- `lib/use-audio-engine.ts` — start/stop/refresh with `POLL_INTERVAL_MS = 2000`. `types/audio-engine.ts` mirrors the Rust structs.

### Net gap
There is **no concurrent capture+render path and no buffer between them.** Routing requires a *new* duplex worker; the single-mode `EngineManager` must not be repurposed for it.

---

## 2. Routing Strategy Comparison

| Option | Feasible now | Eng. complexity | Latency risk | CPU/RAM | User setup | Long-term fit | Recommended timing |
|---|---|---|---|---|---|---|---|
| **A. External virtual cable / Voicemeeter** — app → cable → Audapp capture → DSP → output | **Yes, high** — the cable output is an `eCapture` endpoint the current capture code already handles | Low–Med (new duplex render side + ring buffer + routing manager; capture path reused) | Med (polling + ring; ~40–100 ms round trip) | Low | Med (install + route a cable once) | Good bridge that mirrors a future built-in virtual device | **NEXT — Phase 10B** |
| **B. WASAPI loopback capture** — capture an output's loopback → DSP → another output | Partial — needs `AUDCLNT_STREAMFLAGS_LOOPBACK` (currently `Initialize` is called with `0` flags) | Med | Med–High | Low | Low (no install) | Useful "process Spotify without a cable" path | **Phase 10C** (after A proves the duplex core) |
| **C. Per-app output → virtual endpoint, Audapp captures it** | Manual only | Low (UI instructions) / High (automation — Windows exposes no stable public API to set per-app output for arbitrary apps) | n/a | n/a | Med | Good once virtual devices exist | **Manual guidance now; automation deferred** |
| **D. Custom Audapp virtual audio device** (Audapp Game/Chat/Music/Browser/Mic) | **No** | **Very high** — WDK/SYSVAD, kernel streaming, driver signing (EV cert / attestation), installer, admin elevation | Low (kernel) | Low | High (install + signing) | **Ideal end state** | **Deferred** — needs dedicated research/build phases |
| **E. APO / system effect** | **No** | High — APO COM object, MMDevice property-store registration, strict format constraints, can break system audio | Low | Low | High | System-wide EQ end state | **Deferred** — riskier than D for first-class control |

### Why Option A over D/E right now
Option A reuses essentially all existing infrastructure (capture path, DSP pipeline, device probing, command/UI patterns) and adds **zero kernel/driver/admin/signing surface**. It is fully user-space, reversible, opt-in, and honest about what it does. Options D and E require driver/APO development, code signing, installers, and admin elevation, and — if wrong — can destabilize *system-wide* audio. They are far too large and risky for the next step. Option A proves the `capture → DSP → render` core that **every** future option (including built-in virtual devices) depends on.

---

## 3. Recommended Next Build Phase

**Phase 10B — External Virtual Cable Routing POC (manual, opt-in).**

Proves the path:

```
selected capture / virtual-input device → Audapp duplex engine → existing DSP/EQ chain → selected physical output device
```

It is manual and opt-in. It makes **no** automatic app-routing claims, adds **no** driver/APO, and makes **no** system-wide EQ claims.

---

## 4. POC Architecture

### Concept
A new, isolated duplex engine captures from a selected `eCapture` device (a virtual-cable output, Voicemeeter, or a mic), buffers samples in a preallocated ring buffer, applies the **existing global DSP/EQ chain**, and renders to a selected physical output device. The user routes an app's audio into the virtual cable using Windows' own per-app output picker; Audapp then processes whatever arrives on the cable.

### Command / UI model (Routing Lab page)
- Select **capture / virtual-input** device.
- Select **render / output** device.
- **Start / Stop** (no auto-start).
- Status: state, device format, estimated latency, buffer/ring info, underrun/overrun counts, optional peak/RMS meter.
- Feedback warning + a short virtual-cable setup hint.
- Reuse the existing global DSP/EQ — link to the Equalizer page rather than duplicating controls.

### Safety rules
- **Block** start when `capture_device_id == render_device_id` (obvious feedback).
- **Require** capture sample-rate == render sample-rate (SRC deferred); otherwise refuse start with a clear message ("Set both devices to the same sample rate, e.g. 48 kHz").
- Keep the **limiter on by default** in the routing path; never auto-start; keep gains conservative.
- **Mutual exclusivity with Engine Lab:** routing refuses to start while an engine *test* worker is running (and vice versa), because both drive the shared DSP status flags. Documented as a known POC limitation.

---

## 5. Backend Architecture Plan

Create a **new, isolated `routing` module** — do **not** modify `EngineManager`, so the working Engine Lab is untouched.

```
src-tauri/src/audio_engine/routing/
  mod.rs        // re-exports: routing_start / routing_stop / routing_status / routing_shutdown
  types.rs      // RoutingConfigInput, RoutingRuntimeStatus, RoutingState
  manager.rs    // global OnceLock<Mutex<RoutingManager>>; single worker; lifecycle mirrors manager.rs
  duplex.rs     // the duplex WASAPI worker (capture + render in ONE thread)
  ring.rs       // preallocated f32 ring buffer (thread-owned; SPSC-style read/write indices)
  safety.rs     // feedback + format guards, run BEFORE the worker starts
```

(Or place commands in a new `audio_engine/routing_commands.rs`.)

### Threading model — single-threaded duplex (recommended for the POC)
One worker thread services both clients each cycle:
1. `dsp.maybe_refresh()`.
2. **Drain capture:** loop `GetNextPacketSize` / `GetBuffer` / `ReleaseBuffer`, pushing interleaved f32 samples into the ring (convert i16 → f32 on the way in). Ring full ⇒ drop + `overrun_count += 1`.
3. **Service render:** `GetCurrentPadding`; for `available` frames, pull from the ring, apply DSP **per channel**, map channels to the output layout, write (convert f32 → i16 if the output is i16). Ring empty ⇒ write silence + `underrun_count += 1`.
4. `sleep(half_buffer_period)`.

Single-threaded keeps the ring buffer thread-owned (no lock-free cross-thread sync, no new crates), and a ~200 ms ring cushion absorbs jitter between the two independent 20 ms clocks. A two-thread SPSC ring is a **future optimization**, not part of the POC.

### Responsibilities
- **Routing lifecycle** (`manager.rs`): mirror `engine_start/stop/status/shutdown` exactly (spawn thread, `stop_flag`, join, status atomics, 2 s graceful shutdown on window close).
- **Capture worker / render worker:** combined in the single duplex loop above.
- **Ring buffer** (`ring.rs`): preallocated `Vec<f32>` sized to ≈ `sample_rate * channels * 0.2`; read/write indices; no allocation after construction.
- **Sample format handling:** f32 + i16 (reuse the existing conversion approach); other formats refuse start with a clear message.
- **Channel handling:** equal counts copy 1:1; mono → stereo duplicates; stereo → mono averages; otherwise map first `min(ch_in, ch_out)` channels and warn.
- **DSP application — add ONE focused method** to `DspPipeline`: `process_routing_sample(x, channel_index) -> f32` applying the full chain **gain → HP → EQ → LP → limiter** per channel, reusing the existing `in_*` states/coeffs + the stateless `soft_limit`. (Neither existing method fits: `process_render_mono` is mono; `process_capture_sample` omits the limiter.) Keeping the limiter in-path is also a **safety** feature against loud feedback/clipping. The routing pipeline reuses the **same `config::global()`**, so Equalizer changes affect routed audio live.
- **Underrun/overrun tracking:** atomic counters surfaced in status.
- **Feedback safety checks:** in `safety.rs`, run before the worker starts (see §4).
- **Status reporting** (`RoutingRuntimeStatus`, atomics like `manager.rs`): state, capture/render device ids, sample rate, channels in/out, buffer frames, estimated round-trip latency (capture buffer + ring fill + render buffer), `underrun_count`, `overrun_count`, `glitch_count`, ring fill %, optional peak/rms, warning, last_error.

### Commands (registered in `lib.rs`; add `routing_shutdown()` to the window-`Destroyed` handler)
- `start_audio_routing(input: RoutingConfigInput)`
- `stop_audio_routing()`
- `get_audio_routing_status()`

### Decision: separate manager vs reuse
Use a **separate `RoutingManager`.** The existing `EngineManager` enforces single-worker / single-mode and would have to be substantially rewritten for duplex; a separate manager keeps the proven Engine Lab stable and isolates POC risk.

---

## 6. Real-Time Safety Plan

Audio-thread (duplex worker) rules — mirror the existing engine's discipline:
- **No heap allocation** in the hot path — ring buffer + DSP states preallocated in a setup step before the loop.
- **No logging**, no `println!`, no Tauri events, no filesystem access from inside the loop.
- **No UI calls.** Status is exposed only via atomics + a `Mutex` snapshot read by the status command — never written per-sample.
- **No heavy locks** in the loop; config read via the lock-free atomic snapshot (`maybe_refresh`, version-gated).
- **Bounded ring buffer;** underrun/overrun handled by counters, never by blocking or allocating.
- Conservative buffer/sleep sizing reused from the existing engine (20 ms buffer, half-period sleep).

---

## 7. Frontend / UI Plan

A new **Routing Lab** page (separate from Engine Lab):
- `types/audio.ts`: add `"routing"` to `SectionId`.
- `app/App.tsx`: add to `navigation[]` and the `content` record (`<RoutingLabView outputDevices=… inputDevices=…/>`, reusing the already-computed device lists).
- `components/layout/sidebar.tsx`: add a `routing` icon (e.g. lucide `Cable` or `Route`).
- `components/routing/routing-lab-view.tsx`: capture-device `Select` (label "Capture / virtual input"), output-device `Select`, Start/Stop, status panel (state, format, latency, underrun/overrun, ring fill, peak/RMS meter), feedback warning, and a short virtual-cable setup hint. Reuse the global DSP/EQ — link to the Equalizer page rather than duplicating controls.
- `types/routing.ts` + `lib/use-audio-routing.ts` (mirror `use-audio-engine.ts`, 2 s status poll).

### Honest UI copy
> **Routing Lab is experimental.** It processes audio from a selected capture / virtual-input device and sends it to a selected output, applying your Equalizer/DSP settings. It does **not** automatically route app audio yet. Use a virtual cable (e.g. VB-CABLE) or Voicemeeter to send an app into Audapp, then pick that cable as the capture device here.

---

## 8. Acceptance Criteria for Phase 10B

- User selects a capture/virtual-input device and a physical output device on the Routing Lab page.
- User starts `capture → DSP → output`; audio from the capture device is heard through the output.
- Existing **Equalizer/DSP** settings (EQ bands, HP/LP, gains, limiter) audibly affect the routed audio.
- Routing starts/stops cleanly; no hang on stop or on app close.
- Status reports latency + underrun/overrun where feasible.
- Feedback risk is **blocked** (same device) or warned.
- **No** automatic app-routing claims; **no** custom driver/APO; **no** system-wide EQ claims.
- Engine Lab, Equalizer, Mixer, Apps, Devices all still work; DSP persistence still works.
- `cargo check`, `cargo test`, and `npm run build` (incl. `tsc`) pass.

---

## 9. Risks & Deferrals

### Risks (with mitigations)
- **Feedback loops** — block identical capture/render device; keep the limiter on in-path.
- **Latency too high** — inherent to polling + ring buffer; report it; acceptable for a POC.
- **Buffer underruns/overruns** — atomic counters + ~200 ms ring cushion; surface in status.
- **Sample-format mismatch** — f32/i16 handled; other formats refuse start with a clear message.
- **Sample-rate mismatch** — refuse start (SRC deferred); instruct the user to match rates.
- **Channel-count mismatch** — simple 1↔2 / equal mapping + warning.
- **CPU spikes / deadlock on stop** — reuse the proven join + 2 s graceful-shutdown pattern.
- **User confusion about cable setup** — in-UI hint; cable not installed simply means it won't appear in the capture list.

### Deferrals
Custom driver; APO; automatic per-app routing; WASAPI loopback (→ Phase 10C); production multi-channel mixer/bus; virtual-device installer/signing; noise suppression; system-wide EQ; advanced sample-rate conversion; simultaneous multi-channel busses; event-driven WASAPI; two-thread SPSC ring buffer.

---

## Next step

Hand the companion build prompt
`docs/superpowers/prompts/2026-05-30-audapp-phase-10b-routing-poc-composer25-build-prompt.md`
to **Composer-2.5** in **Build mode** to implement Phase 10B.
