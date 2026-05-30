# Audapp — Phase 5B WASAPI Audio Engine Foundation — Build Prompt

## Metadata

- **Target Thread:** Audapp — Phase 5B WASAPI Audio Engine Foundation Implementation
- **Target Agent:** Claude Code
- **Suggested Model / Effort:** Claude Sonnet 4.6 — High effort
- **Suggested Mode:** Build mode
- **Suggested Skills:**
  - `executing-plans`
  - `windows-audio`
  - `wasapi`
  - `rust`
  - `windows-rs`
  - `tauri-app-architecture`
  - `real-time-audio`
  - `frontend-integration`
- **Project Name:** Audapp
- **Project Path:** `C:\Users\mustafa\Audapp`

---

## Context

You are working on **Audapp**, a Windows desktop audio control application built with Rust + Tauri v2 + React + TypeScript + shadcn/ui + Tailwind CSS + `windows-rs` 0.58.

**Read the Phase 5A plan first:**
```
C:\Users\mustafa\Audapp\docs\superpowers\specs\2026-05-30-audapp-phase-5a-wasapi-audio-engine-foundation-plan.md
```

This plan contains the full architecture, WASAPI API decisions, module structure, TypeScript types, frontend integration plan, real-time safety rules, and verification steps. Implement exactly what is described there.

---

## Step 0 — Pre-flight: Commit Phase 4B

The working tree contains Phase 4B recovery fixes (sessions.rs, controls.rs, session-target.ts) that are present but uncommitted. **Before writing any Phase 5B code, commit them:**

```bash
git add src-tauri/src/audio/sessions.rs src-tauri/src/audio/controls.rs src/lib/session-target.ts
git commit -m "fix: Phase 4B session control recovery

- Robust display-name fallback chain (resolve_session_display_name)
- ISimpleAudioVolume via direct session-control cast for read and write
- isSessionControllable no longer requires volume !== null"
```

Verify `cargo check`, `cargo test`, `npm run build` are all green before proceeding.

---

## Phase 5B Build Scope

Implement the **WASAPI Audio Engine Foundation** as defined in the Phase 5A plan. The goal is a real WASAPI stream proof-of-concept with manual start/stop, not production routing.

### What to implement

#### Rust — `src-tauri/src/audio_engine/`

Create a new module with these files:

**`types.rs`** — DTOs:
- `EngineState` enum (Stopped/Starting/Running/Stopping/Error) → serializes as `"stopped"/"starting"/"running"/"stopping"/"error"`
- `EngineMode` enum (None/RenderSilence/RenderTestTone/CaptureMeter/CaptureToNull) → lowercase snake_case
- `AudioEngineRuntimeStatus` struct (camelCase serde):
  ```rust
  state: EngineState
  mode: EngineMode
  input_device_id: Option<String>
  output_device_id: Option<String>
  sample_rate: Option<u32>
  channels: Option<u16>
  bits_per_sample: Option<u16>
  buffer_frames: Option<u32>
  estimated_latency_ms: Option<f64>
  peak_level: Option<f32>
  rms_level: Option<f32>
  glitch_count: u32
  warning: Option<String>
  last_error: Option<String>
  updated_at: String
  ```
- `StartAudioEngineTestInput` struct (camelCase serde): `mode`, `input_device_id`, `output_device_id`, `tone_frequency_hz`, `tone_gain`
- `DeviceFormatInfo` struct: `device_id`, `device_name`, `kind`, `sample_rate`, `channels`, `bits_per_sample`, `is_float`

**`errors.rs`** — `EngineError` enum with `.message() -> String`. Variants: `Platform`, `Windows`, `AlreadyRunning`, `InvalidInput`, `StreamFailed`. No panics.

**`manager.rs`** — Process-global engine manager. Key requirements:
- Use `std::sync::OnceLock<std::sync::Mutex<EngineManager>>` or equivalent for singleton state.
- `start(input) -> Result<AudioEngineRuntimeStatus, EngineError>` — returns `AlreadyRunning` if already running; spawns worker thread; passes stop flag + status arc to worker.
- `stop() -> AudioEngineRuntimeStatus` — sets stop flag, joins thread, updates state to Stopped.
- `status() -> AudioEngineRuntimeStatus` — returns snapshot with latest peak/rms from atomics.
- `shutdown()` — idempotent; called on app close; bounded join (2s timeout, then log and continue).
- Shared state between manager and worker thread: `Arc<AtomicBool>` (stop flag), `Arc<Mutex<AudioEngineRuntimeStatus>>` (status updates outside hot path), `Arc<AtomicU32>` peak_bits + rms_bits (f32 transmuted as u32), `Arc<AtomicU32>` glitch_count.

**`wasapi.rs`** — WASAPI stream implementation. Key requirements:
- COM initialization: `CoInitializeEx(None, COINIT_MULTITHREADED)` per worker thread. Uninit on exit.
- Reuse `super::audio::devices::create_enumerator()` where possible.
- Open device by ID: `IMMDeviceEnumerator::GetDevice(&HSTRING::from(id))`.
- Activate `IAudioClient` (not IAudioClient3, unless trivially supported).
- `GetMixFormat()` — use the result directly as the stream format (never provide custom format).
- `Initialize(AUDCLNT_SHAREMODE_SHARED, 0, buffer_duration_100ns, 0, mix_format_ptr, null)` — shared mode only.
- `GetBufferSize()`, `GetService::<IAudioRenderClient>()` or `GetService::<IAudioCaptureClient>()`.
- `Start()` on the client.
- **Timed loop** (conservative, not event-driven unless you're certain it's simpler):
  - Render: `GetCurrentPadding()` → `available = buffer_size - padding` → if available > 0: `GetBuffer(available)` → fill (silence or sine) → `ReleaseBuffer(available, flags)`.
  - Capture: `GetNextPacketSize()` loop → `GetBuffer()` → compute peak/rms → `ReleaseBuffer()`.
  - After each iteration: `std::thread::sleep(half_buffer_period)`.
  - Check stop flag every iteration.
- On `AUDCLNT_E_DEVICE_INVALIDATED` or any unrecoverable HRESULT: set state to Error + lastError, break loop.
- Cleanup: `IAudioClient::Stop()`, `Reset()`, release COM objects, `CoUninitialize()`.

**`format.rs`** — `WAVEFORMATEX`/`WAVEFORMATEXTENSIBLE` → `DeviceFormatInfo`. Probe default render and capture endpoints for `get_audio_device_formats`.

**`metrics.rs`** — `estimatedLatencyMs = buffer_frames as f64 / sample_rate as f64 * 1000.0`. Build/update `AudioEngineRuntimeStatus` from config + atomics.

**`tone.rs`** — `ToneGenerator { phase: f32, frequency: f32, gain: f32, sample_rate: u32 }`. `next_sample() -> f32` uses phase accumulator (`phase += 2π * freq / sr`; sine). Default gain 0.1, default frequency 440.0. No allocations.

**`mod.rs`** — wires sub-modules; `pub use` manager API and DTOs.

**`src-tauri/src/lib.rs`** — add `mod audio_engine;` and register 4 new commands:
```rust
audio_engine_commands::get_audio_engine_runtime_status,
audio_engine_commands::get_audio_device_formats,
audio_engine_commands::start_audio_engine_test,
audio_engine_commands::stop_audio_engine_test,
```

**`src-tauri/src/commands.rs` or new `audio_engine_commands.rs`** — implement the 4 commands. Do NOT modify the existing `get_audio_engine_status` mock command.

#### TypeScript — `src/types/audio-engine.ts`

```typescript
export type AudioEngineState = "stopped" | "starting" | "running" | "stopping" | "error";
export type AudioEngineMode = "none" | "render_silence" | "render_test_tone" | "capture_meter" | "capture_to_null";

export type StartAudioEngineTestInput = {
  mode: Exclude<AudioEngineMode, "none">;
  inputDeviceId?: string | null;
  outputDeviceId?: string | null;
  toneFrequencyHz?: number | null;
  toneGain?: number | null;
};

export type AudioEngineRuntimeStatus = {
  state: AudioEngineState;
  mode: AudioEngineMode;
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  sampleRate: number | null;
  channels: number | null;
  bitsPerSample: number | null;
  bufferFrames: number | null;
  estimatedLatencyMs: number | null;
  peakLevel: number | null;
  rmsLevel: number | null;
  glitchCount: number;
  warning: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type DeviceFormatInfo = {
  deviceId: string;
  deviceName: string;
  kind: "input" | "output";
  sampleRate: number | null;
  channels: number | null;
  bitsPerSample: number | null;
  isFloat: boolean;
};
```

#### TypeScript — `src/types/audio.ts`

Add `"engine"` to the `SectionId` union type.

#### TypeScript — `src/lib/use-audio-engine.ts`

Hook wrapping the 4 engine commands via `invokeCommand` (from `src/lib/tauri.ts`). Interface:
```typescript
export function useAudioEngine() {
  // status: AudioEngineRuntimeStatus — current engine status
  // isLoading: boolean — pending start/stop/refresh
  // error: string | null — last invoke error
  // deviceFormats: DeviceFormatInfo[]
  // start(input): void — calls start_audio_engine_test
  // stop(): void — calls stop_audio_engine_test
  // refresh(): void — calls get_audio_engine_runtime_status
}
```
Poll `get_audio_engine_runtime_status` every 2 seconds **only while `status.state === "running"`**. Stop polling when stopped/error.

#### Frontend — `src/components/engine/engine-lab-view.tsx`

A single view component using the `useAudioEngine` hook. Props: `outputDevices: AudioDiscoveryDevice[]`, `inputDevices: AudioDiscoveryDevice[]`.

**Controls card:**
- Output device Select (from `outputDevices` prop; shows name)
- Input device Select (from `inputDevices` prop; shows name; only enabled for capture modes)
- Mode Select (render_silence / render_test_tone / capture_meter / capture_to_null)
- Tone frequency Slider (100–2000 Hz; visible only when mode = render_test_tone)
- Tone gain Slider (0.01–0.5; visible only when mode = render_test_tone)
- Start Button (disabled when running or loading)
- Stop Button (disabled when stopped or loading)
- Refresh Button

**Status card:**
- State Badge (color-coded: green=running, yellow=starting/stopping, red=error, gray=stopped)
- Mode text
- Device names in use
- Format info: sample rate, channels, bits per sample
- Buffer frames + estimated latency ms
- Peak level Progress bar + RMS level Progress bar (visible only in capture modes when running)
- Warning text (amber, if warning)
- Last error text (red, if lastError)
- Always-visible disclaimer paragraph: *"Audio Engine Lab is for testing only. It does not route app audio yet. EQ and noise suppression are not active yet."*

Use existing shadcn components: `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription`, `Button`, `Badge`, `Select`/`SelectTrigger`/`SelectContent`/`SelectItem`, `Slider`, `Progress`. Reuse `SectionHeader` component pattern. No new dependencies needed.

#### App wiring — `src/app/App.tsx`

1. Import `EngineLabView` from `@/components/engine/engine-lab-view`.
2. Add to `navigation` array: `{ id: "engine", label: "Audio Engine Lab", description: "WASAPI test bench" }`.
3. Add to `content` map:
   ```typescript
   engine: (
     <EngineLabView
       outputDevices={outputDevices}
       inputDevices={discoveryDevices.filter(d => d.kind === "input")}
     />
   )
   ```

---

## Real-Time Safety Rules (non-negotiable)

The audio hot path (inside the `GetBuffer`→`ReleaseBuffer` block) **must not** contain:
- Any heap allocation (`Vec::new`, `String::from`, `format!`, `Box::new`, etc.)
- Any logging
- Any filesystem access
- Any Tauri event emission
- Any `Mutex` lock
- Any `async`/`.await`
- Any string formatting
- Any config parsing

**Allowed in hot path:** AtomicU32 stores, simple arithmetic, `ToneGenerator::next_sample()`, stack-local primitives.

Status snapshot updates happen **outside** the hot path, at the loop level (not per-frame).

---

## Scope Boundary — DO NOT implement

- Real app/channel audio routing
- Per-app output device switching
- Virtual audio devices, Windows drivers, APOs
- EQ DSP, noise suppression
- Live mic-to-output monitoring
- Session callbacks (`IAudioSessionNotification`, `IAudioSessionEvents`)
- Exclusive-mode audio
- Advanced sample-rate conversion
- Background auto-start
- Any modification to the existing mock `get_audio_engine_status` command
- Any changes to Mixer, EQ, Noise, Profiles views or their mock data

---

## Verification

### Required checks (must all pass):
```bash
# From C:\Users\mustafa\Audapp
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

### Manual Windows smoke tests:
1. Start Audapp — launches clean.
2. Discovery (Devices page) — still works.
3. Apps page — session volume/mute/channel-assignment still works.
4. Audio Engine Lab page — renders; disclaimer visible.
5. Select output device → mode "Render Silence" → Start → status shows `running` with latency info → Stop → shows `stopped`.
6. Mode "Render Test Tone" → Start → faint 440 Hz tone audible → Stop.
7. Select input device → mode "Capture Meter" → Start → peak/RMS meters update → Stop.
8. Click Start/Stop 5 times rapidly — no crash, no stuck state.
9. Start engine → **close Audapp** → no crash, no hang (closes within ~3s).
10. Dashboard/Settings — still show mock engine status (not affected).
11. No UI copy claims routing/EQ/noise is working.

---

## Acceptance Criteria

- [ ] `npm run build` passes (TypeScript + Vite)
- [ ] `cargo check` passes
- [ ] `cargo test` passes (existing 6 tests + any new tests)
- [ ] Tauri dev app starts
- [ ] Phase 4B recovery committed and verified
- [ ] Audio Engine Lab page renders in nav
- [ ] Render silence mode starts/stops without crash
- [ ] Render test-tone mode produces audible low-gain tone
- [ ] Capture meter mode shows updating peak/RMS
- [ ] Engine status reflects real state (not mock)
- [ ] App closes cleanly while engine is running
- [ ] Discovery and session control still work
- [ ] Dashboard/Settings mock engine status untouched
- [ ] No routing/DSP/EQ/noise/driver/APO work added
- [ ] No UI copy implies routing/EQ/noise are functional

---

## Final Response Format

When finished, report:

1. **What was implemented** — module-by-module summary.
2. **Files changed** — full list with brief description per file.
3. **How to run/test** — exact commands + manual steps.
4. **WASAPI APIs used** — list of `windows-rs` interfaces called.
5. **Real vs test-only** — what is real WASAPI vs still mock.
6. **Known limitations** — edge cases, devices not tested, deferred items.
7. **Checks passed** — results of `npm run build`, `cargo check`, `cargo test`.
8. **Recommended Phase 6 next step** — short description of what comes after Phase 5B.

---

## Very Short Summary

This prompt implements Audapp Phase 5B: a manual WASAPI Audio Engine Foundation. It adds a new `audio_engine/` Rust module with shared-mode render (silence + low-gain test tone) and capture (meter/to-null) stream support, four new Tauri commands (`start_audio_engine_test`, `stop_audio_engine_test`, `get_audio_engine_runtime_status`, `get_audio_device_formats`), a new `use-audio-engine` React hook, and an **Audio Engine Lab** UI page. The existing discovery, session volume/mute control, channel assignments, and mock Dashboard/Settings engine status are untouched. No routing, EQ, noise suppression, DSP, virtual devices, drivers, or APOs are added.
