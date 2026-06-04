# Audapp Phase 17A — Routing Detection Fix Report

**Date:** 2026-06-02  
**Branch:** codex/phase-12h-driver-binding-fix-docs  
**Fix:** Phase 17A — Audapp virtual input "Not found" detection bug

---

## 1. Driver Preflight

```
devcon status @ROOT\DEVGEN\AUDAPP12G0001
→ Name: Audapp Input — Driver is running.

Get-PnpDevice -InstanceId 'ROOT\DEVGEN\AUDAPP12G0001'
→ FriendlyName: Audapp Input  Status: OK  Class: MEDIA
```

Driver state intact. ProblemCode: 0. No regression.

---

## 2. Endpoint Registry Verification

MMDevice render endpoints:

| GUID | Name (PID=2/DeviceDesc) | Parent device (PID=6) | Parent ID (PID=2) | State |
|------|------------------------|----------------------|-------------------|-------|
| `{6a08946d-...}` | Hoparlör | High Definition Audio Device | HDAUDIO\FUNC_01\VEN_15AD... | 1 (Active) |
| `{6dee1be1-...}` | Hoparlör | **Audapp Input** | **ROOT\DEVGEN\AUDAPP12G0001** | 1 (Active) |

Key observations:
- Both endpoints store `PKEY_Device_DeviceDesc` (PID=2) = "Hoparlör" in the registry
- The Audapp endpoint's parent device name (`{b3f8fa53...},6`) = "Audapp Input" confirms identity
- The composite FriendlyName "Hoparlör (Audapp Input)" is computed at runtime by the Windows Audio Engine from endpoint desc + device name — it is NOT stored explicitly in the registry
- `IPropertyStore::GetValue(PKEY_Device_FriendlyName)` returns the full composite string at runtime, which is what `get_friendly_name()` reads via COM
- The hardcoded fallback IDs in `bridge-lab-view.tsx` (`{0.0.0.00000000}.{6dee1be1-...}`) match the actual Audapp render endpoint — confirmed

---

## 3. Root Cause

**The `routing_get_status()` function never searched for the Audapp endpoint. It only returned `audapp_render_id` and `audapp_render_name` from the in-memory `RoutingState`, which starts as `None` (default) and is only populated when `routing_enable()` is called.**

Timeline of the bug:
1. App starts → `RoutingState::default()` → `audapp_render_id: None`
2. Every 3s poll calls `routing_get_status_cmd`
3. `routing_get_status()` reads `state.audapp_render_id` → `None`
4. Frontend receives `audappRenderName: null`
5. UI renders: `"Not found — driver may not be running"`
6. Enable button disabled (`!routing.audappRenderName`)

The existing `find_audapp_render_com()` helper was correct — it enumerates `DEVICE_STATE_ACTIVE` render endpoints, reads `PKEY_Device_FriendlyName` via COM (returns "Hoparlör (Audapp Input)"), and finds the endpoint by `contains("audapp")`. It just was never called from `routing_get_status()`.

This was NOT a driver bug. The driver was running and the endpoint was visible to COM at all times.

---

## 4. File Changed

| File | Change |
|------|--------|
| `src-tauri/src/audio_policy/manager.rs` | `routing_get_status()` now drops mutex before COM calls, then does a live scan for the Audapp endpoint when not stored in state |

No other files changed. The frontend UI, types, and hook are correct as-is.

---

## 5. Fix Detail

**Before:** `routing_get_status()` held the mutex and read `state.audapp_render_id` directly (None until enable).

**After:** `routing_get_status()` clones all state fields and drops the mutex, then calls `with_com(|| find_audapp_render_com())` when `stored_audapp_id` is None. The scan result populates `audapp_render_id` and `audapp_render_name` in the returned `RoutingStatus`. If the scan fails (driver stopped), `last_error` is set to the scan error message.

When routing is enabled, the stored `audapp_render_id` is used directly (no redundant COM scan).

No mutex is held during any COM call, eliminating any deadlock risk.

---

## 6. Build Results

```
cargo check --manifest-path src-tauri\Cargo.toml
→ 0 errors · 26 warnings (pre-existing, unrelated) · Finished dev profile in 2.68s

npm run build
→ ✓ built in 5.42s · 0 errors
```

---

## 7. Expected Behavior After Fix

1. App starts
2. `routing_get_status_cmd` returns:
   ```json
   {
     "routingEnabled": false,
     "currentDefaultRenderName": "Hoparlör (High Definition Audio Device)",
     "audappRenderName": "Hoparlör (Audapp Input)",  ← now populated
     "audappRenderId": "{0.0.0.00000000}.{6dee1be1-...}",
     ...
   }
   ```
3. System Routing section shows:
   - Current Windows output: Hoparlör (High Definition Audio Device)
   - **Audapp virtual input: Hoparlör (Audapp Input)** ← not "Not found"
4. Enable Audapp Routing button is enabled
5. User selects physical output and clicks Enable
6. Windows default output switches to Hoparlör (Audapp Input)
7. Bridge starts in `resampled_passthrough` mode

---

## 8. Manual Smoke Test Steps

```
1. Run: npm run tauri dev
2. Open Bridge Lab
3. Confirm System Routing shows:
   Current Windows output = Hoparlör (High Definition Audio Device)
   Audapp virtual input   = Hoparlör (Audapp Input)          ← key check
4. Confirm Enable Audapp Routing button is enabled
5. Select Hoparlör (High Definition Audio Device) as routing output
6. Click Enable Audapp Routing
7. Windows tray: output should now = Hoparlör (Audapp Input)
8. Play audio in browser/media player
9. Confirm bridge mode = resampled_passthrough
10. Confirm frames_rendered counter increases
11. Confirm audio audible through physical speakers
12. Click Disable Audapp Routing
13. Windows output restored to Hoparlör (High Definition Audio Device)
14. Repeat Enable/Disable to verify clean cycle
```

---

## 9. Safety

- No driver files changed
- No INF files changed
- No root device scripts run
- No devcon/pnputil executed
- No boot settings changed
- No EQ/DSP logic added
- No commits made

---

## 10. Current Git Status

```
branch: codex/phase-12h-driver-binding-fix-docs
changed: src-tauri/src/audio_policy/manager.rs  (routing_get_status live scan)
```

---

## 11. Next Step

**Manual smoke test** (user): `npm run tauri dev` → Bridge Lab → confirm "Audapp virtual input: Hoparlör (Audapp Input)" appears → Enable → audio audible → Disable → output restored.

**Phase 17B (after smoke test):** Persist `previousDefaultRenderId` to `app_local_data_dir` so the Windows output can be restored if Audapp crashes while routing is enabled.
