# Audapp Phase 13A — WASAPI Probe Runtime Results

**Date:** 2026-06-02  
**Branch:** codex/phase-12h-driver-binding-fix-docs  
**Phase:** 13A Runtime Verification — WASAPI Probe

---

## 1. Phase 12 Preflight

```powershell
Get-PnpDevice -InstanceId 'ROOT\DEVGEN\AUDAPP12G0001' | Format-List FriendlyName,Status,Class
Get-PnpDeviceProperty -InstanceId 'ROOT\DEVGEN\AUDAPP12G0001' -KeyName DEVPKEY_Device_ProblemCode,...
```

Result:
```
FriendlyName : Audapp Input
Status       : OK
Class        : MEDIA
ProblemCode  : 0
DriverInfPath: oem19.inf
```

**Phase 12 state is intact. No regression.**

---

## 2. How the Probe Was Run

**Method:** Rust standalone binary (Option A — preferred approach).

A diagnostic binary `audapp_endpoint_probe` was added to the Tauri project. It:
1. Calls `enumerate_endpoint_diagnostics()` to list all MMDevice endpoints
2. Filters by name keywords: "audapp", "audiocodec", "hoparlör", "mikrofon"
3. Calls `probe_endpoint(id)` for each matching endpoint
4. Prints structured results and a pass/fail summary

Run command:
```powershell
cargo run --manifest-path src-tauri\Cargo.toml --bin audapp_endpoint_probe
```

---

## 3. Endpoint Diagnostics

Three endpoints matched (includes the real HDA hardware render that is also named "Hoparlör"):

| # | Friendly Name | Flow | State | Default Render | Default Capture |
|---|---------------|------|-------|---------------|-----------------|
| 1 | Hoparlör (High Definition Audio Device) | render | active | false | false |
| 2 | **Hoparlör (Audapp Input)** | **render** | **active** | **true** | false |
| 3 | **Mikrofon (Audapp Input)** | **capture** | **active** | false | false |

### Notable: Audapp Input is the system default render device

The Audapp Input render endpoint has `is_default_render: true`. This means Windows selected it as the system default audio output. This is consistent with the user confirming the Audapp Devices page shows the endpoints.

---

## 4. Render Endpoint Probe — Hoparlör (Audapp Input)

```
ID:    {0.0.0.00000000}.{6dee1be1-f344-45e4-aa77-2fb20caac6b9}
State: active
Default render: true
Default capture: false

Activate:        OK
GetMixFormat:    OK — 44100Hz 2ch 32-bit float
GetDevicePeriod: default=100000 (100ns units = 10ms), min=30000 (100ns units = 3ms)
Initialize:      OK  (AUDCLNT_SHAREMODE_SHARED, 100ms buffer)
Start:           OK
Stop:            OK
Error:           none
```

**Result: FULLY WASAPI-CAPABLE in shared mode.**

---

## 5. Capture Endpoint Probe — Mikrofon (Audapp Input)

```
ID:    {0.0.1.00000000}.{84bbfd53-05f2-4232-b20b-f8c4237c18d6}
State: active
Default render: false
Default capture: false

Activate:        OK
GetMixFormat:    OK — 44100Hz 1ch 32-bit float  (mono)
GetDevicePeriod: default=100000 (100ns units = 10ms), min=30000 (100ns units = 3ms)
Initialize:      OK  (AUDCLNT_SHAREMODE_SHARED, 100ms buffer)
Start:           OK
Stop:            OK
Error:           none
```

**Result: FULLY WASAPI-CAPABLE in shared mode.**

---

## 6. Summary — Raw Probe Output

```
=== Summary ===
Endpoints probed:  3
Activated OK:      3/3
Initialized OK:    3/3
Started OK:        3/3
Stopped OK:        3/3
All WASAPI steps passed: YES
```

---

## 7. Format Analysis

| Property | Render (Audapp Input) | Capture (Audapp Input) |
|----------|-----------------------|------------------------|
| Sample rate | 44100 Hz | 44100 Hz |
| Channels | 2 (stereo) | 1 (mono) |
| Bit depth | 32-bit | 32-bit |
| Format | IEEE float | IEEE float |
| Default period | 10 ms (100,000 × 100ns) | 10 ms |
| Min period | 3 ms (30,000 × 100ns) | 3 ms |

Both endpoints use 44100 Hz / 32-bit float. The capture endpoint is mono. The driver's ACX descriptor defines these pin formats.

---

## 8. Files Changed (Phase 13A Runtime)

| File | Change |
|------|--------|
| `src-tauri/src/lib.rs` | Added `pub use audio::{enumerate_endpoint_diagnostics, probe_endpoint, AudioEndpointDiagnostic, EndpointProbeResult};` |
| `src-tauri/src/bin/audapp_endpoint_probe.rs` | **New** — standalone diagnostic binary |
| `src-tauri/Cargo.toml` | Added `[[bin]]` entry for `audapp_endpoint_probe` |

No driver files, no INF files, no device creation scripts modified.

---

## 9. Build / Check Results

```powershell
cargo check --manifest-path src-tauri\Cargo.toml
# Result: 0 errors, 23 pre-existing warnings (unchanged)

cargo run --manifest-path src-tauri\Cargo.toml --bin audapp_endpoint_probe
# Compiled in 14.91s, ran successfully, exited 0
```

---

## 10. Phase 13A Completion Status

**Phase 13A is COMPLETE.**

All 12 verification questions from the Phase 13A spec are answered:

| Question | Answer |
|----------|--------|
| Does Windows Core Audio enumerate Audapp Input? | ✅ YES — two endpoints |
| Is it render, capture, or only PnP MEDIA? | ✅ Both render and capture endpoints |
| Render endpoint ID | `{0.0.0.00000000}.{6dee1be1-f344-45e4-aa77-2fb20caac6b9}` |
| Capture endpoint ID | `{0.0.1.00000000}.{84bbfd53-05f2-4232-b20b-f8c4237c18d6}` |
| Render data flow | eRender |
| Capture data flow | eCapture |
| Default device status | Render endpoint is system default render device |
| Supported formats | 44100Hz / 2ch stereo / 32-bit float (render); 44100Hz / 1ch mono / 32-bit float (capture) |
| Can WASAPI open in shared mode? | ✅ YES — both endpoints |
| Can WASAPI Initialize? | ✅ YES — both endpoints |
| Can WASAPI Start + Stop? | ✅ YES — both endpoints |
| Does Audapp Devices page show it? | ✅ YES (user confirmed) |

---

## 11. Exact Next Task — Phase 14

**Phase 14: User-Mode Audio Bridge Implementation**

The driver exposes a working render endpoint (44100Hz stereo float) and capture endpoint (44100Hz mono float). Both are WASAPI-usable in shared mode.

The next technical task is to build the user-mode audio bridge:

1. **Render-to-capture loopback:** Open the Audapp Input render endpoint (WASAPI render client) and the Audapp Input capture endpoint (WASAPI capture client). Pass audio from the render pin to the capture pin via a shared ring buffer.

2. **Format negotiation:** The render pin is 44100Hz 2ch, the capture pin is 44100Hz 1ch. A stereo-to-mono mixdown may be required at the bridge.

3. **Application integration:** Applications writing to the Audapp Input render endpoint (treating it as a speaker) will have their audio captured by the capture endpoint (treated as a microphone by recording apps).

Suggested Phase 14 architecture:
```
App → Render to Audapp Input (as "speaker")
      ↓ bridge (user-mode Rust thread)
      Capture from Audapp Input (as "microphone") → Recording app
```

Key implementation considerations:
- The render endpoint is already the system default device — applications will route to it by default
- The bridge must run in a dedicated thread with proper WASAPI event-driven scheduling or polling
- Use the existing `audio_engine` infrastructure as the pattern
- Implement as a new `src-tauri/src/audio_bridge/` module
