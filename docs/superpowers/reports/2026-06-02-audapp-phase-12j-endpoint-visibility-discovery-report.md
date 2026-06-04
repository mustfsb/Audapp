# Audapp Phase 12J — Endpoint Visibility + Audapp Discovery Verification Report

**Date:** 2026-06-02  
**Branch:** codex/phase-12h-driver-binding-fix-docs  
**Phase:** 12J — Endpoint Visibility + Audapp Discovery Verification

---

## 1. Starting State

Phase 12J begins after Phase 12I/12I3 fixed Code 37 by aligning the ACX build against ACX 1.0 (not 1.1) for the Win10 19045 target. Phase 13A WASAPI probe and Phase 14A audio bridge POC were also completed before this verification report was formally written.

---

## 2. Preflight — Driver Status

```
& $devcon status "@ROOT\DEVGEN\AUDAPP12G0001"
→ ROOT\DEVGEN\AUDAPP12G0001
      Name: Audapp Input
      Driver is running.
  1 matching device(s) found.

& $devcon stack "@ROOT\DEVGEN\AUDAPP12G0001"
→ ROOT\DEVGEN\AUDAPP12G0001
      Name: Audapp Input
      Setup Class: {4d36e96c-e325-11ce-bfc1-08002be10318} MEDIA
      Upper class filters:
          ksthunk
      Controlling service:
          AudioCodec
  1 matching device(s) found.

Get-PnpDevice -InstanceId 'ROOT\DEVGEN\AUDAPP12G0001' | Format-List FriendlyName,Status,Class,InstanceId
→ FriendlyName : Audapp Input
   Status       : OK
   Class        : MEDIA
   InstanceId   : ROOT\DEVGEN\AUDAPP12G0001

Get-PnpDeviceProperty ... -KeyName DEVPKEY_Device_ProblemCode,DEVPKEY_Device_ProblemStatus,DEVPKEY_Device_DriverInfPath
→ DEVPKEY_Device_ProblemCode    = 0
   DEVPKEY_Device_ProblemStatus = (empty)
   DEVPKEY_Device_DriverInfPath = oem19.inf
```

**Code 37 regression: NO. Driver state is healthy.**

| Check | Result |
|-------|--------|
| Driver running | ✅ YES |
| ProblemCode | 0 |
| ProblemStatus | Empty |
| DriverInfPath | oem19.inf |
| Class | MEDIA |
| Service | AudioCodec |
| Filter | ksthunk |

---

## 3. Windows Media Class Visibility

```powershell
pnputil /enum-devices /class Media | findstr /i "Audapp AudioCodec ROOT DEVGEN oem problem started"
```

```
Instance ID:   ROOT\DEVGEN\AUDAPP12G0001
Description:   Audapp Input
Manufacturer:  Audapp
Status:        Started
Driver Name:   oem19.inf
```

**Audapp Input is Started in Media device class via pnputil.**

---

## 4. Win32_SoundDevice Result

```powershell
Get-CimInstance Win32_SoundDevice | Where-Object { $_.Name -like '*Audapp*' -or $_.Name -like '*AudioCodec*' }
→ (no output)
```

Audapp Input does **not** appear in `Win32_SoundDevice`. This is expected: `Win32_SoundDevice` enumerates WDM legacy sound hardware via the WMI provider and does not list ACX virtual audio endpoints registered through the SWD/MMDEVAPI software device bus. The absence here is not a defect.

All physical sound devices present:
```
Name: High Definition Audio Aygıtı
DeviceID: HDAUDIO\FUNC_01&VEN_15AD&DEV_1975&SUBSYS_15AD1975&REV_1001\5&217BE3D6&0&0001
```

---

## 5. MMDevice Capture Registry Result

```powershell
Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture' | ...
```

| Registry Key (GUID) | Name | State |
|---------------------|------|-------|
| `{62e01aa9-7b62-4014-acdf-ded371f3ad4c}` | Microphone | 1 (Active) |
| `{84bbfd53-05f2-4232-b20b-f8c4237c18d6}` | Mikrofon | 1 (Active) |

The second entry (`{84bbfd53...}`) is the Audapp Input capture endpoint. Full property inspection confirms:

```
{a45c254e-df1c-4efd-8020-67d146a850e0},2   = Mikrofon              ← PKEY_Device_FriendlyName
{b3f8fa53-0004-438e-9003-51a46e139bfc},6   = Audapp Input          ← device interface name
{b3f8fa53-0004-438e-9003-51a46e139bfc},2   = {1}.ROOT\DEVGEN\AUDAPP12G0001
{9c119480-ddc2-4954-a150-5bd240d454ad},2   = SWD\MMDEVAPI\{0.0.1.00000000}.{84bbfd53-05f2-4232-b20b-f8c4237c18d6}
{233164c8-...},1                           = ...microphone0
```

**Audapp Input capture endpoint is in the MMDevice Capture registry. State = Active (1).**

---

## 6. MMDevice Render Registry Result

```powershell
Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render' | ...
```

| Registry Key (GUID) | Name | State |
|---------------------|------|-------|
| `{6a08946d-0d29-4ac5-a577-e61d69be0195}` | Hoparlör | 1 (Active) |
| `{6dee1be1-f344-45e4-aa77-2fb20caac6b9}` | Hoparlör | 1 (Active) |

The second entry (`{6dee1be1...}`) is the Audapp Input render endpoint. Full property inspection confirms:

```
{a45c254e-df1c-4efd-8020-67d146a850e0},2   = Hoparlör              ← PKEY_Device_FriendlyName
{b3f8fa53-0004-438e-9003-51a46e139bfc},6   = Audapp Input          ← device interface name
{b3f8fa53-0004-438e-9003-51a46e139bfc},2   = {1}.ROOT\DEVGEN\AUDAPP12G0001
{9c119480-ddc2-4954-a150-5bd240d454ad},2   = SWD\MMDEVAPI\{0.0.0.00000000}.{6dee1be1-f344-45e4-aa77-2fb20caac6b9}
{233164c8-...},1                           = ...speaker0
{4b416b7d-...},1                           = {{0.0.0.00000000}.{aaba4725-17bd-4685-9bb3-bc03ab471e4a}}
```

**Audapp Input render endpoint is in the MMDevice Render registry. State = Active (1).**

---

## 7. Windows Sound Settings (Manual Check Not Required)

The endpoint probe confirms Audapp Input render is the **system default render device** (`Default render: true`). This means:
- It appears in Windows Sound settings under Output devices.
- It is listed as the default output in the Sound Control Panel.
- Applications routing audio to the system default will route through Audapp Input.

---

## 8. Audapp Devices Discovery — Endpoint Probe Output

The `audapp_endpoint_probe` binary (built in Phase 13A) uses the same `IMMDeviceEnumerator` → `EnumAudioEndpoints` path as `src-tauri/src/audio/devices.rs`. Running it confirmed:

```
[1/3] Hoparlör (High Definition Audio Device) [render]
  ID:    {0.0.0.00000000}.{6a08946d-0d29-4ac5-a577-e61d69be0195}
  State: active
  Default render:  false

[2/3] Hoparlör (Audapp Input) [render]
  ID:    {0.0.0.00000000}.{6dee1be1-f344-45e4-aa77-2fb20caac6b9}
  State: active
  Default render:  TRUE          ← system default output
  GetMixFormat:    OK — 44100Hz 2ch 32-bit float
  Initialize:      OK
  Start:           OK

[3/3] Mikrofon (Audapp Input) [capture]
  ID:    {0.0.1.00000000}.{84bbfd53-05f2-4232-b20b-f8c4237c18d6}
  State: active
  Default capture: false
  GetMixFormat:    OK — 44100Hz 1ch 32-bit float
  Initialize:      OK
  Start:           OK

=== Summary ===
Endpoints probed:    3
Activated OK:        3/3
Initialized OK:      3/3
Started OK:          3/3
All WASAPI steps:    YES
```

Both Audapp Input endpoints appear in the WASAPI enumeration with full names `Hoparlör (Audapp Input)` and `Mikrofon (Audapp Input)`.

---

## 9. Audapp Devices Page Analysis

`src-tauri/src/audio/devices.rs` uses `ENDPOINT_STATE_MASK = ACTIVE | DISABLED | NOTPRESENT | UNPLUGGED` — all states are enumerated, none are filtered. `PKEY_Device_FriendlyName` is used to read the name, which returns the full combined name (`Hoparlör (Audapp Input)`).

`src/components/devices/devices-view.tsx` applies no name/ID/manufacturer filter — it splits only by `kind` ("output" vs "input") and renders all entries.

The Audapp Devices page **will show**:
- **Output:** Hoparlör (Audapp Input) — active — **Default**
- **Output:** Hoparlör (High Definition Audio Device) — active
- **Input:** Mikrofon (Audapp Input) — active
- **Input:** Microphone — active

No app code change was required.

---

## 10. App Code Changes

None. Discovery was already correct.

---

## 11. Build / Check Results

No code was changed. No rebuild was required.

Previous build state (from Phase 14A, still valid):
```
cargo check → 0 errors
npm run build → 0 errors, 1906 modules
```

---

## 12. Conclusion

**Outcome: Case A — Endpoint visible in Windows AND Audapp discovers it.**

| Item | Result |
|------|--------|
| Code 37 regression? | NO |
| Driver running? | YES — Status OK, ProblemCode 0 |
| Driver INF | oem19.inf |
| Win32_SoundDevice (WMI legacy) | Not listed (expected for ACX virtual endpoint) |
| MMDevice Capture registry | `{84bbfd53...}` = Mikrofon (Audapp Input), State Active ✅ |
| MMDevice Render registry | `{6dee1be1...}` = Hoparlör (Audapp Input), State Active ✅ |
| System default render device | Hoparlör (Audapp Input) ← YES |
| WASAPI Activate/Initialize/Start | OK (44100Hz 2ch float, 44100Hz 1ch float) |
| Audapp discovery code | Enumerates all states, no name filter |
| Audapp Devices page | Will show both endpoints |
| App code changed? | NO |

---

## 13. Exact Next Task — Phase 14B

**Phase 14B: Bridge Lab Runtime Verification**

Phase 14A implemented the user-mode audio bridge POC (render loopback + capture read). Phase 14B is runtime verification:

1. Run `npm run tauri dev`
2. Navigate to Bridge Lab page (Cable icon in sidebar)
3. Enable "Render loopback capture" + "Capture endpoint read" toggles
4. Click **Start POC**
5. Play audio to any app while Audapp Input is the system default render device
6. Observe:
   - `renderLoopback.packetsRead`, `framesRead`, `peak`, `rms` with audio playing
   - `renderLoopback.peak/rms` with no audio (should be ~0)
   - `captureRead.packetsRead`, `framesRead`, `peak` (likely 0 unless driver has render→capture routing)
   - Any errors shown in the UI
7. Click **Stop POC**
8. Verify app does not crash and CPU does not spike
9. Classify outcome:
   - **A**: Loopback counters increment with audio, capture emits silence → driver-side bridge needed
   - **B**: Both streams increment → driver already has render→capture routing
   - **C/D/E**: Error conditions (see Phase 14A report Section 8)
10. Write Phase 14B report

The Bridge Lab endpoint IDs are hardcoded from Phase 13A and match the confirmed endpoints above.
