# Audapp — Phase 10B Routing POC — Composer-2.5 Build Prompt

## Metadata

- **Target Thread:** `Audapp — Phase 10B Routing POC Implementation`
- **Target Agent:** `Composer-2.5`
- **Mode:** `Build`
- **Project Name:** `Audapp`
- **Project Path:** `C:\Users\mustafa\Audapp`
- **Companion plan (read first):** `docs/superpowers/specs/2026-05-30-audapp-phase-10a-app-audio-routing-strategy-plan.md`

> **Domain focus / areas to apply** (these are knowledge areas, not invokable tools): Windows audio (Core Audio / MMDevice), WASAPI shared-mode capture & render, real-time-audio safety, Rust + `windows-rs`, audio routing & ring buffers, Tauri v2 app architecture, React/TypeScript frontend integration, methodical debugging.

---

## Project Context

Audapp is a Windows desktop audio control app built with **Rust + Tauri v2 + React + TypeScript + shadcn/ui + Tailwind + `windows-rs`**.

It already has: real device/session discovery, app volume/mute control, channel-assignment + mixer persistence, a WASAPI **Engine Lab** (test tone / capture meter), a real RT-safe **DSP/EQ pipeline** (5-band peaking EQ, HP/LP filters, soft limiter, presets) wired to the **Equalizer** page, and DSP persistence.

**Current limitation:** the DSP/EQ only processes Audapp's *own* Engine Lab test audio. It cannot yet process Spotify, Discord, games, or browser audio.

**This phase (10B)** builds the first real app-audio routing path — a **manual, opt-in Routing Lab** that captures a selected input/virtual-cable device, runs it through the existing DSP/EQ chain, and renders it to a selected physical output. **No custom driver, no APO, no automatic app routing, no system-wide EQ.**

### Key facts about the existing code (verify as you go)
- **Engine is single-worker / single-mode.** `src-tauri/src/audio_engine/manager.rs` holds a global `EngineManager { worker: Option<WorkerState> }`; `engine_start` returns `AlreadyRunning` if a worker exists. **Do not repurpose it for duplex** — build a separate routing manager.
- **WASAPI worker:** `src-tauri/src/audio_engine/wasapi.rs` opens ONE device by id (`enumerator.GetDevice(&HSTRING)`), `Activate::<IAudioClient>`, `GetMixFormat`, `Initialize(AUDCLNT_SHAREMODE_SHARED, 0, 200_000 /*20 ms*/, 0, mix_fmt, None)`. Render uses `IAudioRenderClient`; capture uses `IAudioCaptureClient`. The capture loop currently meters then **discards** audio. Both loops poll with `std::thread::sleep(half_buffer_period)`. Formats: f32 + i16 supported; no sample-rate conversion.
- **DSP pipeline (reuse this):** `src-tauri/src/audio_engine/dsp/pipeline.rs::DspPipeline` preallocates per-channel biquad states in `prepare()`; **no alloc/locks/logging in the per-sample hot path**; `maybe_refresh()` reads the shared atomic config once per buffer cycle. Methods today: `process_render_mono(x)` (output_gain→HP→EQ→LP→limiter, mono) and `process_capture_sample(x, ch)` (input_gain→HP→EQ→LP, no limiter, per channel).
- **DSP config (reuse this):** `src-tauri/src/audio_engine/dsp/config.rs::DspConfigShared` is a lock-free atomic global (`config::global()`) **shared by the Equalizer page** — reuse it so EQ changes affect routed audio live.
- **Device probing:** `src-tauri/src/audio_engine/format.rs::probe_device_formats()` enumerates `eRender` + `eCapture` endpoints. Virtual cables appear as normal endpoints; **VB-CABLE "CABLE Output" is an `eCapture` endpoint**, so the existing capture approach works for it with no new capture code.
- **Commands:** registered in `src-tauri/src/lib.rs` `invoke_handler!`; window `Destroyed` runs `engine_shutdown()`.
- **Frontend nav:** `SectionId` union in `src/types/audio.ts`; `navigation[]` + `content` record in `src/app/App.tsx`; `icons: Record<SectionId, …>` in `src/components/layout/sidebar.tsx`. `src/components/engine/engine-lab-view.tsx` + `src/lib/use-audio-engine.ts` are the UI/hook templates.

---

## Build Scope

**First, read** `docs/superpowers/specs/2026-05-30-audapp-phase-10a-app-audio-routing-strategy-plan.md` in full. Implement **only** the approved Phase 10B POC described there.

### You MUST implement

**Backend — a new, isolated `routing` module** (do not modify `EngineManager`):

```
src-tauri/src/audio_engine/routing/
  mod.rs        // routing_start / routing_stop / routing_status / routing_shutdown
  types.rs      // RoutingConfigInput, RoutingRuntimeStatus, RoutingState
  manager.rs    // global OnceLock<Mutex<RoutingManager>>; single worker; lifecycle mirrors manager.rs
  duplex.rs     // duplex WASAPI worker (capture + render in ONE thread)
  ring.rs       // preallocated f32 ring buffer (thread-owned)
  safety.rs     // feedback + format guards (run BEFORE start)
```

1. **Single-threaded duplex worker** (`duplex.rs`): per cycle → `dsp.maybe_refresh()`; drain capture packets into the ring (i16→f32 on ingest; ring full ⇒ drop + `overrun_count`); service render from the ring (`GetCurrentPadding`, pull frames, apply DSP per channel, channel-map to output, f32→i16 on egress if needed; ring empty ⇒ silence + `underrun_count`); `sleep(half_buffer_period)`. Open the capture client on the selected `eCapture` device and the render client on the selected `eRender` device, both shared-mode, COM MTA — mirror the patterns in `wasapi.rs`.
2. **Ring buffer** (`ring.rs`): preallocated `Vec<f32>` ≈ `sample_rate * channels * 0.2` (≈200 ms); read/write indices; **no allocation after construction**.
3. **DSP — add ONE method** to `DspPipeline`: `process_routing_sample(x: f32, channel_index: usize) -> f32` applying the full chain **gain → HP → EQ → LP → limiter** per channel, reusing the existing `in_*` biquad states/coeffs and the stateless `soft_limit`. Reuse `config::global()` (no separate config). Early-return `x` when DSP is disabled/unsupported, matching the existing methods.
4. **Safety guards** (`safety.rs`, before the worker starts): **block** start if `capture_device_id == render_device_id`; **require** capture sample-rate == render sample-rate (else refuse with a clear message — SRC is deferred); channel mapping: equal copy 1:1, mono→stereo duplicate, stereo→mono average, else map first `min(ch_in, ch_out)` + warn; limiter on by default; **never auto-start**; **mutual exclusivity** — refuse routing start while the engine *test* worker is running, and vice versa.
5. **Status** (`RoutingRuntimeStatus`, atomics like `manager.rs`): state, capture/render device ids, sample rate, channels in/out, buffer frames, estimated round-trip latency, `underrun_count`, `overrun_count`, `glitch_count`, ring fill %, optional peak/rms, warning, last_error.
6. **Commands** (`audio_engine/routing_commands.rs` or extend `audio_engine_commands.rs`), registered in `lib.rs`; add `routing_shutdown()` to the window-`Destroyed` handler: `start_audio_routing(input)`, `stop_audio_routing()`, `get_audio_routing_status()`.

**Frontend — a new "Routing Lab" page:**

7. `src/types/audio.ts`: add `"routing"` to `SectionId`.
8. `src/app/App.tsx`: add to `navigation[]` and the `content` record (`<RoutingLabView outputDevices=… inputDevices=…/>`, reusing the already-computed device lists — output devices and `kind === "input"` devices).
9. `src/components/layout/sidebar.tsx`: add a `routing` icon (lucide `Cable` or `Route`).
10. `src/components/routing/routing-lab-view.tsx`: capture-device `Select` ("Capture / virtual input"), output-device `Select`, Start/Stop, status panel (state, format, latency, underrun/overrun, ring fill, peak/RMS meter), a feedback warning, and a short virtual-cable setup hint. **Do not duplicate DSP controls** — link to the Equalizer page; the routed audio uses the same global DSP/EQ.
11. `src/types/routing.ts` + `src/lib/use-audio-routing.ts` (mirror `use-audio-engine.ts`, 2 s status poll while running).

**Honest UI copy** (use verbatim or close):
> Routing Lab is experimental. It processes audio from a selected capture / virtual-input device and sends it to a selected output, applying your Equalizer/DSP settings. It does not automatically route app audio yet. Use a virtual cable (e.g. VB-CABLE) or Voicemeeter to send an app into Audapp, then pick that cable as the capture device here.

### Real-time safety rules (the duplex worker)
No heap allocation in the hot path; no logging / `println!` / Tauri events / filesystem access inside the loop; no UI calls; status only via atomics + a `Mutex` snapshot read by the status command; no heavy locks in the loop (config via the lock-free atomic snapshot); bounded ring buffer with counter-based under/overrun handling; reuse the 20 ms buffer + half-period sleep sizing.

### You MUST NOT
- Modify or destabilize the existing Engine Lab, Equalizer, Mixer, Apps, or Devices behavior.
- Add a custom Windows audio driver, virtual audio device, or APO.
- Add WASAPI loopback capture (that is Phase 10C — capture from `eCapture` endpoints only here).
- Claim automatic per-app routing or system-wide EQ anywhere in code or UI.
- Add sample-rate conversion, noise suppression, multi-channel bus mixing, or installer/signing work.

---

## Acceptance Criteria

- Project builds successfully (`cargo check`, `cargo test`, `npm run build` incl. `tsc`).
- The Tauri dev app starts (`npm run tauri dev`).
- Existing discovery / session control still works; Engine Lab still works; Equalizer/DSP persistence still works.
- Routing POC can **start and stop manually** without hangs (including on app close).
- Audio from the selected input/virtual-cable device is **audible through the selected output**.
- Existing **Equalizer/DSP** settings (EQ bands, HP/LP, gains, limiter) **audibly affect** the routed audio.
- Feedback risk is **warned or blocked** (identical device blocked; limiter on in-path).
- **No** custom driver/APO; **no** automatic app-routing claims; **no** system-wide EQ claims.
- TypeScript passes; Rust compiles.

---

## Final Response Format (Composer must report)

1. **What was implemented.**
2. **Files changed** (created/modified).
3. **How to run / test**, including the VB-CABLE (or Voicemeeter) setup steps and how to route an app into the cable.
4. **Routing architecture used** (duplex worker, ring buffer, DSP reuse, safety guards).
5. **What works** vs **what remains manual / experimental.**
6. **Known limitations.**
7. **Test results** (`cargo check`, `cargo test`, `npm run build`, manual audio check).
8. **Recommended next phase** (Phase 10C — WASAPI loopback capture, removing the third-party cable dependency).

---

## Very Short Summary

This prompt directs Composer-2.5 to build Audapp's Phase 10B routing POC: a manual, opt-in **Routing Lab** page backed by a new isolated duplex WASAPI worker that captures a selected input/virtual-cable device, runs it through the existing global DSP/EQ pipeline (via a new `process_routing_sample` method and a preallocated ring buffer), and renders it to a selected output. It must keep the existing Engine Lab/Equalizer/Mixer/Apps/Devices intact, enforce feedback/sample-rate safety guards, and explicitly avoid custom drivers, APOs, loopback capture, and any automatic-routing or system-wide-EQ claims.
