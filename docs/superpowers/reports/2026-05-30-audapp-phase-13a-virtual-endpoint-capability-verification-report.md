# Audapp Phase 13A — Virtual Endpoint Capability Verification Report

**Date:** 2026-06-02  
**Branch:** codex/phase-12h-driver-binding-fix-docs  
**Phase:** 13A — Virtual Endpoint Capability Verification

---

## 1. Phase 12 Starting State

Phase 12 state confirmed healthy before any Phase 13A work began.

```powershell
Get-PnpDevice -InstanceId 'ROOT\DEVGEN\AUDAPP12G0001' | Format-List FriendlyName,Status,Class,InstanceId
Get-PnpDeviceProperty -InstanceId 'ROOT\DEVGEN\AUDAPP12G0001' -KeyName DEVPKEY_Device_ProblemCode,DEVPKEY_Device_ProblemStatus,DEVPKEY_Device_DriverInfPath
```

Output:

```
FriendlyName : Audapp Input
Status       : OK
Class        : MEDIA
InstanceId   : ROOT\DEVGEN\AUDAPP12G0001

KeyName : DEVPKEY_Device_ProblemCode   Data: 0
KeyName : DEVPKEY_Device_ProblemStatus Data: (empty)
KeyName : DEVPKEY_Device_DriverInfPath Data: oem19.inf
```

**Result: Phase 12 state is intact. No regression. Code 37 is not present.**

---

## 2. PnP Device State

```powershell
pnputil /enum-devices /class Media | findstr /i "Audapp AudioCodec ROOT DEVGEN oem"
Get-PnpDevice | Where-Object { $_.InstanceId -like '*AUDAPP*' -or $_.FriendlyName -like '*Audapp*' }
```

Output:

```
Instance ID:   ROOT\DEVGEN\AUDAPP12G0001
Device Description: Audapp Input
Manufacturer Name:  Audapp
Status:             Started
Driver Name:        oem19.inf
```

- Driver is loaded and `Status: Started`.
- Present in MEDIA class.
- `Win32_SoundDevice` does not see it — expected, as Win32_SoundDevice uses a different enumeration path (legacy WDM).

---

## 3. MMDevice / Core Audio Endpoint Visibility

**MAJOR FINDING:** The Audapp Input driver exposes **two** Windows Core Audio endpoints.

```powershell
Get-PnpDevice | Where-Object { $_.FriendlyName -like '*Audapp*' } | Format-List FriendlyName,Status,Class,InstanceId
```

Output:

```
FriendlyName : Audapp Input
Status       : OK
Class        : MEDIA
InstanceId   : ROOT\DEVGEN\AUDAPP12G0001

FriendlyName : Hoparlör (Audapp Input)
Status       : OK
Class        : AudioEndpoint
InstanceId   : SWD\MMDEVAPI\{0.0.0.00000000}.{6DEE1BE1-F344-45E4-AA77-2FB20CAAC6B9}

FriendlyName : Mikrofon (Audapp Input)
Status       : OK
Class        : AudioEndpoint
InstanceId   : SWD\MMDEVAPI\{0.0.1.00000000}.{84BBFD53-05F2-4232-B20B-F8C4237C18D6}
```

Decoding the Instance IDs:
- `{0.0.0.00000000}` = Data flow 0 = **eRender** (render/speaker output)
- `{0.0.1.00000000}` = Data flow 1 = **eCapture** (capture/microphone input)

| Endpoint | Friendly Name | Data Flow | Status | Endpoint ID |
|----------|---------------|-----------|--------|-------------|
| Render | Hoparlör (Audapp Input) | eRender | OK | `{0.0.0.00000000}.{6DEE1BE1-F344-45E4-AA77-2FB20CAAC6B9}` |
| Capture | Mikrofon (Audapp Input) | eCapture | OK | `{0.0.1.00000000}.{84BBFD53-05F2-4232-B20B-F8C4237C18D6}` |

"Hoparlör" is Turkish for Speaker. "Mikrofon" is Turkish for Microphone. These are localized labels from Windows for the device role.

**Both endpoints are Status: OK.**

---

## 4. Audapp Devices Page Result

Code analysis of `src-tauri/src/audio/devices.rs`:

- `enumerate_devices()` calls `EnumAudioEndpoints(eRender, state_mask)` and `EnumAudioEndpoints(eCapture, state_mask)`
- `state_mask` covers `DEVICE_STATE_ACTIVE | DEVICE_STATE_DISABLED | DEVICE_STATE_NOTPRESENT | DEVICE_STATE_UNPLUGGED`
- Both Audapp Input endpoints are Status: OK, so they will appear as `active` if their WASAPI state is `DEVICE_STATE_ACTIVE`

**Expected result:** The existing Audapp Devices page should already show:
- One "output" device: "Hoparlör (Audapp Input)"
- One "input" device: "Mikrofon (Audapp Input)"

Runtime UI verification was not done in this session (requires running `npm run tauri dev` interactively). This is the primary remaining verification task.

---

## 5. WASAPI Probe Status

A safe, read-only WASAPI probe command was implemented and compiled successfully.

The `probe_audio_endpoint(endpoint_id)` Tauri command:
1. Gets device by ID (`IMMDeviceEnumerator::GetDevice`)
2. Reads friendly name and state
3. Gets data flow via `IMMEndpoint::GetDataFlow()`
4. Activates `IAudioClient`
5. Calls `GetMixFormat` → parses format to human-readable string (e.g. "48000Hz 2ch 32-bit float")
6. Calls `GetDevicePeriod` → records default and minimum periods in 100ns units
7. Calls `Initialize(AUDCLNT_SHAREMODE_SHARED, 0, 100ms_buffer, ...)`
8. Calls `Start`
9. Sleeps 200ms
10. Calls `Stop`
11. Returns structured `EndpointProbeResult`

The probe has not yet been executed — it requires running the app and invoking the Tauri command. To invoke:

```javascript
// From browser console or Tauri invoke
await invoke('probe_audio_endpoint', {
  endpointId: '{0.0.0.00000000}.{6DEE1BE1-F344-45E4-AA77-2FB20CAAC6B9}'
})
// and
await invoke('probe_audio_endpoint', {
  endpointId: '{0.0.1.00000000}.{84BBFD53-05F2-4232-B20B-F8C4237C18D6}'
})
```

---

## 6. Files Changed

| File | Change |
|------|--------|
| `src-tauri/src/audio/diagnostics.rs` | **New** — `AudioEndpointDiagnostic`, `EndpointProbeResult`, `enumerate_endpoint_diagnostics()`, `probe_endpoint()` |
| `src-tauri/src/audio/errors.rs` | Added missing `message_only()` constructor |
| `src-tauri/src/audio/mod.rs` | Added `mod diagnostics` and `pub use diagnostics::{...}` |
| `src-tauri/src/commands.rs` | Added `get_audio_endpoint_diagnostics` and `probe_audio_endpoint` Tauri commands |
| `src-tauri/src/lib.rs` | Registered both new commands in `invoke_handler!` |

No driver files, no INF files, no device creation scripts, no boot settings were touched.

---

## 7. Build / Check Results

```powershell
cargo check --manifest-path src-tauri\Cargo.toml
# Result: 0 errors, pre-existing warnings only (unchanged from before Phase 13A)

npm run build
# Result: ✓ 1904 modules transformed. ✓ built in 4.56s
```

---

## 8. Limitations

1. **Runtime WASAPI probe not executed** — `probe_audio_endpoint` was implemented and compiles, but was not invoked because running `npm run tauri dev` requires an interactive GUI session on the VM. The probe must be called after running the app.

2. **UI display not visually confirmed** — The Devices page code analysis strongly suggests both endpoints will appear, but this must be confirmed by opening the app.

3. **Endpoint state not confirmed as ACTIVE** — The PnP Status is OK for both endpoints. If the WASAPI state is `DEVICE_STATE_ACTIVE`, they will appear in the Devices page. If `DEVICE_STATE_DISABLED`, they will appear but as "disabled". Either way, `enumerate_endpoint_diagnostics()` will report them.

4. **Win32_SoundDevice** does not see the device — this is expected for modern WDM/ACX virtual devices and does not indicate any problem.

---

## 9. Outcome Classification

**Outcome A (partial):** Both MMDevice endpoints exist and are Status: OK. This satisfies the endpoint visibility requirement. WASAPI probe compilation succeeded. Runtime WASAPI success or failure is the remaining open question.

The driver's ACX descriptor exposes both a render pin and a capture pin, which Windows translated into two Core Audio endpoints automatically. This is correct behavior for a virtual audio I/O device.

---

## 10. Exact Recommended Next Task

**Phase 13B: WASAPI Probe Runtime Execution**

On the VM, run:

```powershell
cd C:\Users\musta\Audapp
npm run tauri dev
```

In the running app:
1. Open the Devices page — confirm "Hoparlör (Audapp Input)" and "Mikrofon (Audapp Input)" appear in the device list.
2. From browser dev tools console:
   ```javascript
   const { invoke } = window.__TAURI__.core;
   // List all endpoints with full diagnostics
   const diag = await invoke('get_audio_endpoint_diagnostics');
   console.log(JSON.stringify(diag, null, 2));
   // Probe render endpoint
   const r = await invoke('probe_audio_endpoint', {
     endpointId: '{0.0.0.00000000}.{6DEE1BE1-F344-45E4-AA77-2FB20CAAC6B9}'
   });
   console.log(JSON.stringify(r, null, 2));
   // Probe capture endpoint
   const c = await invoke('probe_audio_endpoint', {
     endpointId: '{0.0.1.00000000}.{84BBFD53-05F2-4232-B20B-F8C4237C18D6}'
   });
   console.log(JSON.stringify(c, null, 2));
   ```
3. Record the probe results (mix format, default period, activate_ok, initialize_ok, start_ok, stop_ok, error).

If both `initialize_ok` and `start_ok` are true for either endpoint:
→ Phase 13B is successful. The virtual device is fully WASAPI-usable.
→ Phase 14 can begin: user-mode audio bridge implementation.

If `initialize_ok` is false with HRESULT `AUDCLNT_E_ENDPOINT_CREATE_FAILED` or similar:
→ The driver needs a real audio format advertised via the ACX pin descriptor.
→ Phase 13B report should include the exact HRESULT.

---

## Summary

| Question | Answer |
|----------|--------|
| Phase 12 state healthy? | ✅ Yes — Status OK, ProblemCode 0, oem19.inf, driver Started |
| Audapp Input in PnP? | ✅ Yes — MEDIA class, Status: Started |
| Audapp Input as MMDevice endpoint? | ✅ YES — Two endpoints: Render + Capture, both Status: OK |
| Render endpoint ID | `{0.0.0.00000000}.{6DEE1BE1-F344-45E4-AA77-2FB20CAAC6B9}` |
| Capture endpoint ID | `{0.0.1.00000000}.{84BBFD53-05F2-4232-B20B-F8C4237C18D6}` |
| Audapp Devices page shows it? | Expected yes — awaits runtime confirmation |
| WASAPI probe implemented? | ✅ Yes — compiled and registered as Tauri command |
| WASAPI probe result | Not yet run — requires interactive app session |
| Next task | Phase 13B: Run app, invoke probe, record WASAPI results |
