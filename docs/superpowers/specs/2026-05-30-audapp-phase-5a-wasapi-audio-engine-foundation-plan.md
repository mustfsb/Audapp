# Audapp Phase 5A — WASAPI Audio Engine Foundation Plan

**Date:** 2026-05-30  
**Status:** Planning complete — ready for Phase 5B implementation  
**Prerequisite:** Phase 4B session-control recovery (present, green, uncommitted as of planning)

---

## 1. Current Codebase Findings

### Phase 4B Recovery Status — PRESENT, GREEN, UNCOMMITTED

The following Phase 4B recovery fixes are in the working tree (not yet committed):

| File | Change |
|------|--------|
| `src-tauri/src/audio/sessions.rs` | `resolve_session_display_name()` fallback chain; `control.cast::<ISimpleAudioVolume>()` for read |
| `src-tauri/src/audio/controls.rs` | Same resolver; `control.cast::<ISimpleAudioVolume>()` for write; grouping-param path removed |
| `src/lib/session-target.ts` | `isSessionControllable` no longer requires `volume !== null` |

Checks verified green: `cargo check`, `cargo test` (6 pass), `npm run build`. **Sonnet should commit Phase 4B before starting Phase 5B work.**

### Stable Foundation Phase 5 Builds On

**Rust backend:**
- `src-tauri/src/audio/{mod,devices,sessions,controls,targeting,assignments,process,com,types,errors}.rs` — discovery + control + persistence, all real and unit-tested.
- `src-tauri/src/audio/com.rs::with_com` — COM MTA wrapper with `RPC_E_CHANGED_MODE` handling. **Reuse this pattern** — engine worker threads init their own COM with the same approach.
- `src-tauri/src/audio/devices.rs::create_enumerator` — reusable `IMMDeviceEnumerator` creation.
- `src-tauri/src/commands.rs::get_audio_engine_status` — returns **mock** `EngineStatus { state:"Mock Ready", latencyMode, cpuLoad, audioLoad, warnings }`. Dashboard and Settings consume it. **Do not replace** — add new real status under new command names.
- `src-tauri/src/lib.rs` — flat `invoke_handler![...]`; append new commands here.

**Frontend:**
- `src/app/App.tsx` — navigation = `SectionId` union + `navigation` array + `content: Record<SectionId, ReactElement>` map. Adding a section: add union member to `src/types/audio.ts`, add entry to `navigation`, add entry to `content`.
- `src/lib/tauri.ts` — `invokeCommand(cmd, args)` (error-preserving, use for lab commands) and `invokeOrFallback` (swallows, for background polling only).
- Hooks pattern: `src/lib/use-audio-discovery.ts`, `src/lib/use-audio-session-control.ts`, `src/lib/use-channel-assignments.ts` — mirror this for `use-audio-engine.ts`.

**Nothing exists yet at:** `src-tauri/src/audio_engine/` — clean greenfield.

### Existing Mock Surfaces (DO NOT REPLACE in Phase 5B)
- Dashboard — "Engine CPU (mock)", "Engine audio (mock)" progress bars, engine warnings list.
- Settings — "Engine state" info row.
- Mock feeds: `src/data/mock-audio.ts` → Mixer, EQ, Noise, Profiles, Settings.

---

## 2. Engine Architecture Plan

### Module Location

```
src-tauri/src/audio_engine/
  mod.rs
  types.rs
  errors.rs
  manager.rs
  wasapi.rs
  format.rs
  metrics.rs
  tone.rs
```

Sibling to `src-tauri/src/audio/` — keeps real-time engine isolated from discovery/control. Reference from `src-tauri/src/lib.rs` as `mod audio_engine;`.

### Module Responsibilities

#### `types.rs`
All DTOs with `#[derive(Debug, Clone, Serialize, Deserialize)]` + `#[serde(rename_all = "camelCase")]`:
- `EngineState` enum: `Stopped | Starting | Running | Stopping | Error`
- `EngineMode` enum: `None | RenderSilence | RenderTestTone | CaptureMeter | CaptureToNull`
- `AudioEngineRuntimeStatus` (see Task 6)
- `StartAudioEngineTestInput` (see Task 5)
- `DeviceFormatInfo` (see Task 6)

#### `errors.rs`
`EngineError` enum with `.message() -> String`. No panics. Variants:
- `Platform(String)` — non-Windows
- `Windows(String)` — HResult-level
- `AlreadyRunning` — clear user message
- `InvalidInput(String)` — bad device id, unknown mode
- `StreamFailed(String)` — WASAPI init/runtime failure

#### `manager.rs`
**Lifecycle owner.** Uses a process-global `OnceLock<Mutex<EngineManager>>` (or static `Mutex<Option<EngineManager>>`):

```rust
pub struct EngineManager {
    worker_handle: Option<JoinHandle<()>>,
    stop_flag: Arc<AtomicBool>,
    status: Arc<Mutex<AudioEngineRuntimeStatus>>,
    glitch_count: Arc<AtomicU32>,
    peak_bits: Arc<AtomicU32>,   // f32 bits via AtomicU32 transmute
    rms_bits: Arc<AtomicU32>,
}
```

Public API:
- `start(input: StartAudioEngineTestInput) -> Result<AudioEngineRuntimeStatus, EngineError>` — returns `AlreadyRunning` if worker alive, spawns worker thread, sets state to `Starting`.
- `stop() -> AudioEngineRuntimeStatus` — signals `stop_flag`, joins thread, sets state to `Stopped`.
- `status() -> AudioEngineRuntimeStatus` — clones current status snapshot (with latest peak/rms from atomics).
- `shutdown()` — called on app exit; idempotent stop.

Worker thread receives clones of `Arc<AtomicBool>` (stop flag), `Arc<Mutex<AudioEngineRuntimeStatus>>` (for out-of-hot-path state updates), and atomic peak/rms. Worker calls `wasapi::run_stream(...)`.

#### `wasapi.rs`
WASAPI plumbing. COM initialized per-thread. Functions:
- `open_device(enumerator, device_id) -> Result<IMMDevice, EngineError>`
- `get_mix_format(device) -> Result<WaveFormatWrapper, EngineError>` — reads format, converts to `DeviceFormatInfo`
- `init_render_client(device, format) -> Result<(IAudioClient, IAudioRenderClient, u32_buffer_frames), EngineError>`
- `init_capture_client(device, format) -> Result<(IAudioClient, IAudioCaptureClient, u32_buffer_frames), EngineError>`
- `run_stream(config, stop_flag, status, peak_bits, rms_bits, glitch_count)` — the worker entry point; conservative timed loop; sets state `Running`; on loop exit sets `Stopped` or `Error`.

#### `format.rs`
- `read_mix_format(device) -> Result<DeviceFormatInfo, EngineError>` — reads `WAVEFORMATEX`/`WAVEFORMATEXTENSIBLE`, extracts sample rate/channels/bits/isFloat.
- `probe_all_device_formats(devices: &[AudioDiscoveryDevice]) -> Vec<DeviceFormatInfo>` — wraps per-device probe for `get_audio_device_formats` command.

#### `metrics.rs`
- `build_status(config, state, buffer_frames, format) -> AudioEngineRuntimeStatus` — constructs status from inputs; computes `estimatedLatencyMs = bufferFrames as f64 / sampleRate as f64 * 1000.0`.
- `update_peak_rms(status_arc, peak_bits, rms_bits)` — reads atomics, updates status without touching hot path.

#### `tone.rs`
- `ToneGenerator { phase: f32, frequency: f32, gain: f32, sample_rate: u32 }` — preallocated.
- `fn next_sample(&mut self) -> f32` — phase accumulator, no alloc, constant time.
- Default gain: `0.1` (~-20 dBFS). Default frequency: `440.0` Hz.

### Threading Model
- One dedicated OS thread per active engine run (via `std::thread::spawn`).
- Tauri command handlers take the `OnceLock<Mutex<EngineManager>>` lock briefly to call `start`/`stop`/`status` — **never** hold the lock across any WASAPI call.
- Audio loop: timed conservative polling (`GetCurrentPadding` → compute available frames → fill → sleep ~half buffer period via `std::thread::sleep`). Event-driven mode (`AUDCLNT_STREAMFLAGS_EVENTCALLBACK`) is optional and only if it's clean; default to timed.
- Hot path: no heap alloc, no logging, no locks (only atomics for peak/rms/glitch), no Tauri emit, no string formatting.
- Status updates: only outside the hot path (before/after `IAudioRenderClient::ReleaseBuffer` loop, not per-frame).

---

## 3. WASAPI API Plan

### Windows Features (windows-rs 0.58)

Already enabled in `Cargo.toml` — verify, add only if compiler reports missing:
```toml
"Win32_Media_Audio"        # IAudioClient, IAudioRenderClient, IAudioCaptureClient, WAVEFORMATEX, etc.
"Win32_System_Threading"   # AvSetMmThreadCharacteristicsW, CreateEventW, WaitForSingleObject
"Win32_Foundation"         # HANDLE, CloseHandle, BOOL
"Win32_System_Com"         # CoInitializeEx, CoUninitialize (already present)
```

May need to add: `Win32_System_Threading` if MMCSS/events are used (check).

### Interface Sequence

**Initialization (render):**
```
CoInitializeEx(MTA)                        // per worker thread, same with_com pattern
create_enumerator()                        // reuse from audio::devices
IMMDeviceEnumerator::GetDevice(id)        // or GetDefaultAudioEndpoint
IMMDevice::Activate::<IAudioClient>(...)   // CLSCTX_ALL
IAudioClient::GetMixFormat()              // read mix format pointer
IAudioClient::Initialize(
    AUDCLNT_SHAREMODE_SHARED,
    0 /* timed */ or AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
    hnsBufferDuration,  // 100ms reasonable start
    0, pwfx, null)
IAudioClient::GetBufferSize() -> u32      // actual buffer frames
IAudioClient::GetService::<IAudioRenderClient>()
IAudioClient::Start()
```

**Render loop (silence):**
```
loop {
    GetCurrentPadding() -> padding
    available = buffer_size - padding
    if available > 0 {
        GetBuffer(available) -> data_ptr
        ReleaseBuffer(available, AUDCLNT_BUFFERFLAGS_SILENT)
    }
    sleep(~half buffer period)
    if stop_flag { break }
}
```

**Render loop (test tone):** same but fill with sine samples via `ToneGenerator`.

**Capture loop:**
```
loop {
    loop {
        GetNextPacketSize() -> packet_size
        if packet_size == 0 { break inner }
        GetBuffer() -> (data_ptr, num_frames, flags)
        // compute peak/rms from data_ptr samples
        update atomics
        ReleaseBuffer(num_frames)
    }
    sleep(~half buffer period)
    if stop_flag { break }
}
```

**Shutdown:**
```
stop_flag.store(true)
join worker thread
// worker: IAudioClient::Stop() then Reset() then release all COM objects
CoUninitialize() // in worker
```

### Decisions
- **`IAudioClient` first** — do not gate Phase 5B on `IAudioClient3`; try it only if it's ergonomic in windows-rs.
- **Timed loop first** — event-driven optional.
- **Shared mode only** — never `AUDCLNT_SHAREMODE_EXCLUSIVE`.
- **Use mix format unchanged** — `GetMixFormat()` result passed directly to `Initialize`; no SRC.
- **On AUDCLNT_E_DEVICE_INVALIDATED or stream error** — set `state:Error + lastError`, stop cleanly; do not panic.
- **MMCSS** — `AvSetMmThreadCharacteristicsW("Games", &task_index)` best-effort; failure is non-fatal, log to status `warning` and continue.
- **Format arithmetic** — detect `isFloat` from `WAVEFORMATEXTENSIBLE.SubFormat == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT` or from `wFormatTag == WAVE_FORMAT_IEEE_FLOAT`; if PCM integer fall back to normalized writes.

---

## 4. Engine Modes

```
EngineState: Stopped | Starting | Running | Stopping | Error
EngineMode:  None | RenderSilence | RenderTestTone | CaptureMeter | CaptureToNull
```

Phase 5B **preferred implementation** (all 4 active modes):
1. `RenderSilence` — `AUDCLNT_BUFFERFLAGS_SILENT` fill.
2. `RenderTestTone` — low-gain sine fill (gain 0.1, freq 440 Hz default, configurable via `StartAudioEngineTestInput`).
3. `CaptureMeter` — capture-to-null + peak/RMS computed per packet.
4. `CaptureToNull` — capture-to-null, no metering (acceptable simpler path).

**Minimum acceptable:** one working render mode + one working capture mode + real `get_audio_engine_runtime_status`.

**Explicitly prohibited in all modes:** live mic-to-output monitoring; automatic start; exclusive mode; any routing.

---

## 5. Tauri Command Contract

New commands (appended to `lib.rs::invoke_handler![...]`). Legacy `get_audio_engine_status` kept:

```rust
// Returns current runtime status (fast, no-op if stopped)
#[tauri::command]
pub fn get_audio_engine_runtime_status() -> AudioEngineRuntimeStatus

// Returns mix format for each active endpoint
#[tauri::command]
pub fn get_audio_device_formats() -> Vec<DeviceFormatInfo>

// Starts the engine test stream; returns fresh status
#[tauri::command]
pub fn start_audio_engine_test(input: StartAudioEngineTestInput) -> AudioEngineRuntimeStatus

// Stops the engine; returns fresh status
#[tauri::command]
pub fn stop_audio_engine_test() -> AudioEngineRuntimeStatus
```

**Start/stop return the latest status** — same reconciliation pattern as `AudioSessionControlResult`.

`StartAudioEngineTestInput`:
```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAudioEngineTestInput {
    pub mode: EngineMode,                    // never "none"
    pub input_device_id: Option<String>,
    pub output_device_id: Option<String>,
    pub tone_frequency_hz: Option<f32>,      // default 440.0
    pub tone_gain: Option<f32>,              // default 0.1
}
```

---

## 6. TypeScript Types

New file: `src/types/audio-engine.ts`

```typescript
export type AudioEngineState =
  | "stopped" | "starting" | "running" | "stopping" | "error";

export type AudioEngineMode =
  | "none" | "render_silence" | "render_test_tone"
  | "capture_meter" | "capture_to_null";

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

`src/types/audio.ts` — add `"engine"` to `SectionId` union.

---

## 7. Frontend Integration Plan

### Files to create/modify

| File | Change |
|------|--------|
| `src/types/audio.ts` | Add `"engine"` to `SectionId` |
| `src/types/audio-engine.ts` | New — engine types (above) |
| `src/lib/use-audio-engine.ts` | New — engine hook |
| `src/components/engine/engine-lab-view.tsx` | New — Audio Engine Lab UI |
| `src/app/App.tsx` | Add nav entry + content entry for `"engine"` |

### `use-audio-engine.ts`

```typescript
export function useAudioEngine() {
  const [status, setStatus] = useState<AudioEngineRuntimeStatus>(idleStatus);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refresh status (also used for polling while running)
  const refresh = useCallback(async () => { ... invokeCommand("get_audio_engine_runtime_status") ... }, []);

  // Poll only while running (5s interval when status.state === "running")
  useEffect(() => { /* interval only when running */ }, [status.state]);

  const start = useCallback(async (input: StartAudioEngineTestInput) => {
    setIsLoading(true);
    try { const s = await invokeCommand<AudioEngineRuntimeStatus>("start_audio_engine_test", { input }); setStatus(s); }
    catch (e) { setError(...); }
    finally { setIsLoading(false); }
  }, []);

  const stop = useCallback(async () => { ... invokeCommand("stop_audio_engine_test") ... }, []);

  return { status, isLoading, error, start, stop, refresh };
}
```

### `engine-lab-view.tsx` UI

Components (all from existing shadcn `src/components/ui/`):
- `SectionHeader` eyebrow "Audio Engine" title "Audio Engine Lab" description "WASAPI test bench for verifying stream initialization, render, and capture. Does not route app audio, apply EQ, or suppress noise."
- **Controls card** — output device Select (from discovery `outputDevices`), input device Select (from discovery input devices), mode Select (4 active modes), optional tone freq/gain Sliders for test-tone mode, Start/Stop Button, Refresh Button.
- **Status card** — state Badge, mode text, device name, sample rate / channels / bits row, buffer frames, estimated latency, peak/RMS Progress bars (visible only in capture modes), warning/lastError text.
- **Disclaimer** — visible `<p>` inside the status card: *"Audio Engine Lab is for testing only. It does not route app audio yet. EQ and noise suppression are not active yet."*
- No flashy visualizer. No mixer behavior. No large redesign.

### App.tsx changes

```typescript
// types/audio.ts SectionId addition: | "engine"
// navigation array entry:
{ id: "engine", label: "Audio Engine Lab", description: "WASAPI test bench" }
// content map entry:
engine: (
  <EngineLabView
    outputDevices={outputDevices}
    inputDevices={discoveryDevices.filter(d => d.kind === "input")}
  />
)
```

---

## 8. Phase 5B Implementation Checklist

1. **Inspect + commit Phase 4B** — confirm recovery fixes present; commit them if not yet committed before starting Phase 5B work.
2. **Add `"engine"` to `SectionId`** — `src/types/audio.ts`.
3. **Create `src/types/audio-engine.ts`** — engine types.
4. **Verify/adjust `windows-rs` features** — check `Cargo.toml`; add `Win32_System_Threading` if missing (for events/MMCSS).
5. **Create `src-tauri/src/audio_engine/`** with all 8 files (`mod.rs`, `types.rs`, `errors.rs`, `manager.rs`, `wasapi.rs`, `format.rs`, `metrics.rs`, `tone.rs`).
6. **Add `mod audio_engine;`** to `src-tauri/src/lib.rs`.
7. **Implement `format.rs`** — mix format readout per device; test compile.
8. **Implement render silence** — `IAudioClient` init, timed render loop with `AUDCLNT_BUFFERFLAGS_SILENT`.
9. **Implement render test tone** — `ToneGenerator` fill in render loop.
10. **Implement capture meter/to-null** — capture loop with peak/RMS atomics.
11. **Implement `manager.rs`** — start/stop lifecycle, stop flag, thread join, shutdown.
12. **Implement `commands.rs` additions** — 4 new commands; no changes to existing commands.
13. **Register commands in `lib.rs`**.
14. **Create `src/lib/use-audio-engine.ts`**.
15. **Create `src/components/engine/engine-lab-view.tsx`**.
16. **Wire nav + content in `src/app/App.tsx`**.
17. **Preserve all existing functionality** — discovery, session control, assignments, Dashboard/Settings mocks.
18. **Run `npm run build` + `cargo check` + `cargo test`** — must be green.
19. **Manual Windows smoke tests** (Section 10).

---

## 9. Real-Time Safety Rules

### Hot path (inside `ReleaseBuffer`/`GetBuffer` call sequence) — MUST AVOID:
- Any heap allocation (`Vec::new()`, `String::from()`, `format!()`, `Box::new()`, etc.)
- Any logging (`log::*`, `println!`, `eprintln!`)
- Any filesystem access
- Any Tauri event emission
- Any UI calls or Tauri command dispatch
- `async`/`.await`
- Any `Mutex` lock (use atomics only for peak/rms/glitch)
- Any string formatting
- Any config parsing or external state reads

### Hot path — ALLOWED:
- Preallocated buffers (allocated once before loop starts)
- `AtomicU32::store`/`load` (SeqCst or Relaxed as appropriate)
- Simple arithmetic (sine computation, dB conversion outside hot path)
- `ToneGenerator::next_sample()` (constant-time, no alloc)
- `std::thread::sleep` for timed-loop pacing
- Stack-local primitive variables

### Outside hot path (before/after buffer loop) — ALLOWED:
- Update status `Arc<Mutex<AudioEngineRuntimeStatus>>` at the loop level (not per-frame)
- Log warnings to status `warning` field
- Increment glitch counter via atomic

**Design principle:** stability over cleverness. If event-driven implementation adds complexity, fall back to timed loop. If `IAudioClient3` adds risk, use `IAudioClient`. The goal is a working, stable proof-of-concept, not a production audio stack.

---

## 10. Risks and Deferrals

### Risks

| Risk | Mitigation |
|------|-----------|
| Feedback (mic → output) | Never implement live mic-to-output monitoring. Capture and render are separate modes. |
| Device format mismatch | Always use `GetMixFormat()` result; never provide custom format. |
| COM/threading errors | Per-thread COM init; `RPC_E_CHANGED_MODE` handling same as `with_com`. |
| Stream init failure | Catch and set `state:Error + lastError`; no panic; user sees inline error. |
| Worker thread shutdown hang | Bounded join with timeout (e.g. 2s); force-abandon on timeout with logged warning. |
| CPU spike from bad loop | Ensure `std::thread::sleep(half_buffer_period)` is called unconditionally each iteration. |
| Glitches/underruns | Count via atomic; report in status; non-fatal. |
| Device unplug while running | `AUDCLNT_E_DEVICE_INVALIDATED` → stop with `state:Error`; not auto-reconnect. |
| App close while engine running | `shutdown()` called from Tauri `on_exit`/drop; bounded join. |
| `IAudioClient3` ergonomics | Use only `IAudioClient` by default; `IAudioClient3` is optional. |

### Deferrals (explicitly out of scope for Phase 5B)

- Real app/channel routing
- Per-app output device switching
- Virtual audio devices, Windows drivers, APOs
- Real EQ DSP (any processing beyond silence/sine)
- Real noise suppression
- Production microphone chain or production mixer
- Per-channel processing
- Live mic monitoring to output
- Session notifications/callbacks (`IAudioSessionNotification`, `IAudioSessionEvents`)
- Installer/signing, admin elevation
- Exclusive mode
- Advanced sample-rate conversion
- Background auto-start audio processing
- Any UI copy claiming routing/EQ/noise/DSP is working

---

## 11. Verification Plan

### Build checks
```bash
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

### Manual Windows smoke tests
1. Start Audapp — app launches without error.
2. Open Devices page — device discovery still works.
3. Open Apps page — session control still works (slider, mute toggle, channel assignment).
4. Open Audio Engine Lab page — page renders, disclaimer visible.
5. Select default output device; select mode "Render Silence"; click Start.
   - Status shows `running`, latency/buffer info appears.
6. Click Stop — status shows `stopped`.
7. Select mode "Render Test Tone" (440 Hz); click Start — faint tone audible; click Stop.
8. Select default input device; select mode "Capture Meter"; click Start — peak/RMS meters update.
9. Click Stop — meters reset.
10. Click Start/Stop rapidly 5 times — no crash, no stuck `starting`/`stopping` state.
11. Start engine; **close app** — no crash, no hang (< 3s clean exit).
12. Reopen app — engine state is `stopped` (fresh start).
13. Confirm Dashboard/Settings still show mock engine status (not affected).
14. Confirm no UI copy claims routing/EQ/noise suppression is working.

---

## 12. WASAPI Readiness → Phase 6 Preview

Once Phase 5B is stable, **Phase 6A** would be:
- Real per-app session capture from a specific process (not full-device capture).
- Loopback render capture (`AUDCLNT_STREAMFLAGS_LOOPBACK`).
- Routing proof-of-concept (app capture → re-render on different device).

Phase 6 is explicitly out of scope for Phase 5B and should not be anticipated in code structure.
