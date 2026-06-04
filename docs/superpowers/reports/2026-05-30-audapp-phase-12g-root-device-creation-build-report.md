# Audapp Phase 12G Root Device Creation — Build Report

**Date:** 2026-06-02  
**Agent:** Composer-2.5  
**Workspace:** `C:\Users\musta\Audapp`  
**Branch:** `main` (no commit created per user request)  
**Hostname:** `DESKTOP-6CK0ST4` (VM)  
**Completion path:** **C — Device created but binding/error problem** (DEVGEN node present; driver not bound to `oem9.inf`; no Media class; no audio endpoint)

---

## 1. Elevation status

| Check | Result |
|-------|--------|
| PowerShell elevated (Administrator) | **Yes** (`True`) |
| User | `desktop-6ck0st4\musta` |

---

## 2. Snapshot confirmation

| Item | Result |
|------|--------|
| User-confirmed snapshot name in thread | **Not explicitly stated** |
| Recommended snapshot | `Audapp before root device creation 12G` |
| Prior guidance (12F) | Take new snapshot after `oem9.inf` staged, before root experiments |

**Note:** Phase 12G build was executed per approved prompt on elevated VM. **Preferred rollback** remains VMware snapshot revert. If no snapshot exists, use manual device removal (see §14).

---

## 3. Published driver package state

**Preflight and post-create:** `oem9.inf` **present** in driver store.

```text
Published Name:     oem9.inf
Original Name:      audiocodec.inf
Provider Name:      Audapp
Signer Name:        Audapp VM Test Code Signing
```

No `pnputil /add-driver` was run in this phase (package already published from Phase 12F).

---

## 4. Pre-existing device check

| Check | Preflight result |
|-------|------------------|
| `pnputil /enum-devices /instanceid ROOT\AudappInput* /drivers` | No devices found |
| `Get-PnpDevice` (Audapp / AudioCodec / ROOT\AudappInput*) | No matches |

**Safe to proceed** with single `devgen` creation.

---

## 5. Signature verification

**Tool:** `C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe`  
**Stage:** `C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64`

| Artifact | Result |
|----------|--------|
| `audiocodec.cat` | **Success** (0 errors) |
| `AudioCodec.sys` | **Success** (0 errors) |

Signer: Audapp VM Test Code Signing (thumbprint `C9C96275386BCDA269FE344FE805C4D668C52F86`).

---

## 6. Test-signing state

```text
testsigning             Yes
```

No boot configuration changes in this phase.

---

## 7. Tool and exact command

| Item | Value |
|------|--------|
| Tool | WDK `devgen.exe` |
| Path | `C:\Program Files (x86)\Windows Kits\10\Tools\10.0.28000.0\x64\devgen.exe` |
| `devcon` used | **No** |
| Attempt count | **1** |

**Command:**

```powershell
& "C:\Program Files (x86)\Windows Kits\10\Tools\10.0.28000.0\x64\devgen.exe" /add /bus ROOT /instanceid AUDAPP12G0001 /hardwareid "ROOT\AudappInput"
```

---

## 8. Creation command output

```text
Microsoft Device Generator

Device successfully created. Device Instance ID: ROOT\DEVGEN\AUDAPP12G0001
```

**Exit code:** 0

---

## 9. Created instance ID

| Field | Value |
|-------|--------|
| PnP instance ID | **`ROOT\DEVGEN\AUDAPP12G0001`** |
| Hardware ID (PnP property) | `ROOT\AudappInput` |
| Compatible IDs | `ROOT\DevGenDevice`, `DevGenDevice` |
| Expected `ROOT\AudappInput*` instance | **Not created** (no `ROOT\AudappInput\...` node) |

---

## 10. Binding result to `oem9.inf`

| Check | Result |
|-------|--------|
| `pnputil /enum-devices /instanceid ROOT\DEVGEN\AUDAPP12G0001 /drivers` | No devices found |
| `pnputil /enum-devices /instanceid ROOT\AudappInput* /drivers` | No devices found |
| `DEVPKEY_Device_DriverInfPath` | Not populated (no driver install) |
| PnP `Service` | **Empty** |
| PnP `Class` / `PNPClass` | **Empty** |
| `ClassGuid` | `{00000000-0000-0000-0000-000000000000}` |
| `DEVPKEY_Device_ProblemCode` | **0** (`CM_PROB_NONE`) |
| `Get-PnpDevice` status | **OK** (generic DEVGEN node, no Media driver stack) |

**Conclusion:** `devgen` created a root **DEVGEN** placeholder with the correct **hardware ID** string, but Windows did **not** install/bind the published **`oem9.inf`** (Audapp Media / `AudioCodec.sys`) driver package. This is a **driver binding / installation** gap, not an endpoint-exposure-only gap.

---

## 11. Media class result

| Check | Result |
|-------|--------|
| Device under Media class | **No** |
| `Get-PnpDevice -Class Media` (Audapp filter) | No matches |
| `Win32_SoundDevice` (Audapp/AudioCodec) | No Audapp entries |
| `pnputil /enum-devices /class Media` (Audapp filter) | No Audapp-related lines |

---

## 12. Endpoint visibility result

| Check | Result |
|-------|--------|
| MMDevices registry (Render/Capture) name filter Audapp/AudioCodec | **No matches** |
| Windows audio endpoint | **None observed** (expected without bound Media driver) |

**12G success criterion met for creation attempt;** endpoint visibility was **not** expected without binding. **No endpoint fixes attempted** in 12G.

---

## 13. Audapp Devices page

**Not tested** — no MMDevice endpoint; Core Audio discovery would have nothing new to find.

---

## 14. Rollback

**No rollback performed** in this session (device left for Phase 12H analysis).

**Recommended (preferred):** Revert VMware snapshot taken before this phase (e.g. `Audapp before root device creation 12G`).

**Manual remove device only** (exact instance ID):

```powershell
pnputil /remove-device "ROOT\DEVGEN\AUDAPP12G0001"
```

**Do not** run `pnputil /delete-driver oem9.inf` unless fully uninstalling the Audapp package is intentional — unrelated `oem*.inf` must not be touched.

**Do not** run another `devgen` or `devcon install` without a 12H plan (duplicate/ghost device risk).

---

## 15. Limitations

- `devgen` reports success but produces a **`ROOT\DEVGEN\...`** instance, not a literal `ROOT\AudappInput\...` instance ID.
- `pnputil /enum-devices` did not list the DEVGEN node by instance ID filter in some queries, while `Get-PnpDevice` did — automation should use both.
- Driver package in store ≠ automatic driver install on DEVGEN-created hardware ID nodes.
- Device Manager and Sound settings UI were not manually opened; PnP/CIM evidence is sufficient to show no Media stack.
- Compile-only ACX sample may still lack endpoints even after binding is fixed (future phases).

---

## 16. Git status (end of phase)

```text
branch: main
staged/untracked: driver package scripts, Phase 12 docs/reports/prompts
no commit
```

---

## 17. Next phase prompt

Generated (binding failure):

```text
docs/superpowers/prompts/2026-05-30-audapp-phase-12h-driver-device-binding-fix-plan-prompt.md
```

---

## 18. Exact next step

Execute **Phase 12H driver/device binding fix plan** on a VM snapshot: analyze why `ROOT\DEVGEN\AUDAPP12G0001` with hardware ID `ROOT\AudappInput` did not install `oem9.inf`, plan a **single** safe binding/install approach (without duplicate root devices), then re-verify Media class and endpoints.
