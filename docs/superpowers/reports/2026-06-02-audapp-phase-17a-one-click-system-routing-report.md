# Audapp Phase 17A — One-Click System Routing Mode Report

**Date:** 2026-06-02  
**Branch:** codex/phase-12h-driver-binding-fix-docs  
**Phase:** 17A — One-Click System Routing Mode

---

## 1. Driver Preflight

```
devcon status @ROOT\DEVGEN\AUDAPP12G0001
→ Name: Audapp Input — Driver is running.
ProblemCode: 0  ·  DriverInfPath: oem19.inf
```

No regression. Driver state intact.

---

## 2. Implementation Summary

Phase 17A adds one-click system-wide Audapp routing. The user clicks **Enable Audapp Routing** and:
1. Audapp detects the current Windows default render endpoint and stores it.
2. Audapp sets the Windows default render to Hoparlör (Audapp Input) for all roles.
3. Audapp starts the bridge to the selected physical output.

Clicking **Disable Audapp Routing**:
1. Stops the bridge.
2. Restores the previous Windows default render endpoint.

No Voicemeeter. No manual Windows Sound settings.

---

## 3. Default Endpoint Switching Method

**API used:** Windows `IPolicyConfig` COM interface (undocumented but stable since Vista).

- **CLSID:** `{870af99c-171d-4f9e-af0d-e63df40c2bc9}` (PolicyConfigClient)
- **IID:** `{f8679f50-850a-41cf-9c72-430f290290c8}` (IPolicyConfig)
- **Method:** `SetDefaultEndpoint(deviceId, role)` at vtable index 10

SetDefaultEndpoint is called for all three roles: eConsole (0), eMultimedia (1), eCommunications (2).

This interface is used by EarTrumpet, VB-Audio, NirSoft SoundVolumeView, and dozens of other audio tools on Windows 10/11. It is not officially documented but has remained stable across all Windows versions since Vista.

**Raw vtable access pattern:** Since `IPolicyConfig` is not in windows-rs, the implementation uses:
1. `CoCreateInstance(CLSID_PolicyConfigClient)` → `IUnknown`
2. Raw `QueryInterface` via vtable index 0 → `*mut c_void` pointer to IPolicyConfig vtable
3. `SetDefaultEndpoint` via `vtable.add(10)` transmute

This is contained entirely in `src-tauri/src/audio_policy/default_endpoint.rs` and is safe to replace or extend.

---

## 4. Files Created / Changed

| File | Type | Description |
|------|------|-------------|
| `src-tauri/src/audio_policy/mod.rs` | New | Module exports |
| `src-tauri/src/audio_policy/types.rs` | New | `RoutingStatus` struct |
| `src-tauri/src/audio_policy/default_endpoint.rs` | New | PolicyConfig COM binding |
| `src-tauri/src/audio_policy/manager.rs` | New | Global routing state, enable/disable logic |
| `src-tauri/src/routing_commands.rs` | New | Tauri commands: `routing_get_status_cmd`, `routing_enable_system`, `routing_disable_system` |
| `src-tauri/src/lib.rs` | Modified | Added `audio_policy`, `routing_commands` modules; registered 3 new commands |
| `src/types/routing.ts` | Modified | Restored `AudioRoutingRuntimeStatus`/`RoutingConfigInput` + added `RoutingStatus` |
| `src/lib/use-routing.ts` | New | `useRouting()` hook with enable/disable/refresh, 3s polling |
| `src/components/bridge/bridge-lab-view.tsx` | Modified | Added System Routing section: status, output selector, Enable/Disable buttons, error recovery |

No driver files, INF files, root device scripts, or boot settings changed.

---

## 5. RoutingStatus DTO

```typescript
interface RoutingStatus {
  routingEnabled: boolean;
  currentDefaultRenderId: string | null;
  currentDefaultRenderName: string | null;
  previousDefaultRenderId: string | null;     // stored on enable
  previousDefaultRenderName: string | null;   // stored on enable
  audappRenderId: string | null;
  audappRenderName: string | null;
  selectedOutputId: string | null;
  selectedOutputName: string | null;
  bridgeRunning: boolean;
  restoreAvailable: boolean;
  lastError: string | null;
}
```

---

## 6. Bridge Config for Routing Mode

When routing is enabled, `bridge_start` is called with:

```rust
BridgePocConfig {
    audapp_render_endpoint_id: Some(audapp_render_id),
    audapp_capture_endpoint_id: None,
    monitor_output_endpoint_id: Some(output_endpoint_id),
    enable_render_loopback_capture: true,
    enable_capture_endpoint_read: false,     // not needed for routing
    enable_physical_monitor_output: true,
}
```

This produces the `resampled_passthrough` mode (44100 Hz → 48000 Hz) automatically via the Phase 16A resampler.

---

## 7. Build Results

```
cargo check --manifest-path src-tauri\Cargo.toml
→ 0 errors  ·  Finished dev profile

npm run build
→ ✓ built in 5.67s  ·  0 errors
```

---

## 8. Manual Smoke Test Steps

```
1. Confirm current Windows output is a physical device (e.g., HDAUDIO speakers)
2. Open Audapp → Bridge Lab (npm run tauri dev)
3. Under "System Routing": confirm current Windows output shows the physical device
4. Confirm "Audapp virtual input" shows "Hoparlör (Audapp Input)"
5. Select the desired physical output from the radio list
6. Click Enable Audapp Routing
7. Observe:
   - Windows Sound tray icon: output should now be Hoparlör (Audapp Input)
   - System Routing section: "Current Windows output" = Hoparlör (Audapp Input)
   - Bridge status badge: running / resampled pass-through
   - Stability Diagnostics: frames_written increasing
8. Play audio in browser / media player
9. Confirm audio is audible through selected physical speakers
10. Click Disable Audapp Routing
11. Observe:
   - Bridge stops
   - Windows output restored to original physical device
   - "Previous output" shows the restored device name
12. Repeat Enable/Disable once to verify clean repeat
```

---

## 9. Safety and Error Recovery

**If SetDefaultEndpoint fails** (COM server unavailable, permissions, etc.):
- Error is shown in the routing panel with the exact message
- Bridge is not started
- Previous default is not stored (no state change)

**If bridge_start fails after default is changed:**
- Windows default was already set to Audapp Input
- `routing_enabled = true` is still stored (the routing state was changed)
- Error is shown in the routing panel
- User can click Disable Audapp Routing to trigger restore

**If restore fails on Disable:**
- Error is shown: "Restore failed: ... Manually set output in Windows Sound settings."
- `previousDefaultRenderName` is shown in the error panel for manual reference

---

## 10. Known Limitations

1. **IPolicyConfig is undocumented** — Microsoft could remove or change this interface in a future Windows update. If it fails, the error message will be "PolicyConfigClient: CoCreateInstance failed" or "IPolicyConfig: QueryInterface failed". In that case, the user must use Windows Sound settings manually.

2. **No UAC elevation required** — PolicyConfig works without admin rights on Windows 10/11 for the logged-in user's default device. If run as a restricted account, it may fail.

3. **Routing state is in-memory only** — If Audapp crashes while routing is enabled, the Windows default output remains Hoparlör (Audapp Input). The user would need to manually restore it in Windows Sound settings. Persisting previous_default to localStorage is Phase 17B work.

4. **System-wide only** — All apps are rerouted, not per-app. Per-app session routing requires Windows Audio Policy session API, which is separate work.

5. **VM audio quality** — As established in Phase 16B, VM audio introduces ~39 discontinuities per session. Audio quality on bare metal should be smooth.

---

## 11. Exact Next Step

**Manual test (user):** Run `npm run tauri dev` → Bridge Lab → Enable Audapp Routing → play audio → confirm audible + stable → Disable → confirm Windows output restored.

**Phase 17B (next):** Persist `previousDefaultRenderId` to localStorage or `app_local_data_dir` so it survives Audapp crashes. Show recovery instructions on startup if Audapp crashed with routing enabled.

**Phase 18 (after):** Per-app audio session routing (IAudioSessionManager2 + per-process session interception) or named pipe virtual cable for true app-level routing.

---

## Summary

| Item | Result |
|------|--------|
| Driver state | OK — running, ProblemCode 0 |
| IPolicyConfig COM binding | Implemented — vtable index 10, all 3 roles |
| SetDefaultEndpoint | Called for eConsole/eMultimedia/eCommunications |
| Previous default restore | On disable, previous stored ID is restored |
| Bridge auto-start | BridgePocConfig with loopback + monitor output |
| Error recovery | Clear message + manual restore instructions shown |
| `cargo check` | 0 errors |
| `npm run build` | 0 errors |
| Manual test | Pending (requires interactive tauri dev session) |
| Commits | None (per safety boundary) |
