# Audapp Phase 12F VM Driver Install Dry Run — Report

**Date:** 2026-06-02  
**Agent:** Composer-2.5  
**Workspace:** `C:\Users\musta\Audapp`  
**Branch:** `main` (no commit created per user request)  
**Hostname:** `DESKTOP-6CK0ST4`  
**Completion path:** **A — Install dry run succeeds** (driver store add succeeded; no `ROOT\AudappInput` device instance created)

## Session history

| Attempt | Elevation | Outcome |
|---------|-----------|---------|
| 1 (Cursor non-admin) | No | Blocked safely; preflight only |
| 2 (elevated VM resume) | Yes | Install + enumeration completed |

## 1. Environment / elevation

| Check | Result |
|-------|--------|
| PowerShell elevated (Administrator) | **Yes** (resume session) |
| User | `desktop-6ck0st4\musta` |
| VM hostname | `DESKTOP-6CK0ST4` |

## 2. Snapshot status

Per user: VMware snapshot taken **after Phase 12E** before Phase 12F install work. Snapshot name not recorded in-repo.

**Recommendation:** Take a new snapshot after this dry run (driver store contains `oem9.inf`) before Phase 12G root-device experiments.

## 3. Package path

```text
C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64
```

## 4. Artifacts present

| File | Size (bytes) | Notes |
|------|--------------|--------|
| `AudioCodec.sys` | 107,680 | Signed |
| `AudioCodec.inf` | 4,241 | `ROOT\AudappInput` hardware ID |
| `audiocodec.cat` | 3,199 | Signed |
| `package-manifest.txt` | 647 | |

## 5. Signature verification (resume)

**Tool:** `C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe`

| Artifact | Result |
|----------|--------|
| `audiocodec.cat` | **Success** (0 errors) |
| `AudioCodec.sys` | **Success** (0 errors) |

Signer: `Audapp VM Test Code Signing` (thumbprint `C9C96275386BCDA269FE344FE805C4D668C52F86`).

## 6. Test-signing state

```text
testsigning             Yes
```

Test-signing was **already enabled**; no `bcdedit /set testsigning on` and **no reboot** required.

## 7. Reboot required

**No.**

## 8. Install command result

**Command:**

```powershell
pnputil /add-driver "C:\Users\musta\Audapp\driver\scaffold\audapp-input\package\Debug\x64\AudioCodec.inf" /install
```

**Output (abridged):**

```text
Adding driver package:  AudioCodec.inf
Driver package added successfully.
Published Name:         oem9.inf

Total driver packages:  1
Added driver packages:  1
```

**Exit code:** 0

## 9. Published driver package

| Field | Value |
|-------|--------|
| Published name | **`oem9.inf`** |
| Original name | `audiocodec.inf` |
| Provider | **Audapp** |
| Class | Media (`{4d36e96c-e325-11ce-bfc1-08002be10318}`) |
| Driver version | 06/02/2026 1.29.27.380 |
| Signer | Audapp VM Test Code Signing |

## 10. Device instance result

| Check | Result |
|-------|--------|
| `pnputil /enum-devices /instanceid ROOT\AudappInput* /drivers` | **No devices were found on the system.** |
| `Get-PnpDevice` (Audapp / AudappInput filter) | **No matches** |
| `Get-CimInstance Win32_SoundDevice` (Audapp/AudioCodec filter) | **No matches** |
| `pnputil /enum-devices /connected` (Audapp/AudioCodec filter) | **No matches** |

**Conclusion:** The signed package was **added to the driver store** successfully. Windows did **not** create a `ROOT\AudappInput` root-enumerated device instance as part of this `pnputil /add-driver ... /install` dry run. This matches the known root-enumeration nuance documented in Phase 12F — **not** treated as an install failure.

**devcon:** Not used (per safety boundaries; Phase 12G should plan controlled root device creation).

## 11. Device Manager / audio endpoint observations

Not manually opened in this session. Based on enumeration:

- No PnP device instance for Audapp Input is present.
- No new Windows audio/media endpoint is expected until a root device is created and the driver stack loads.

**Manual verification (optional):** Device Manager → View → Show hidden devices; look under **Sound, video and game controllers** for **Audapp Input**. Windows Sound settings → unlikely to show a new playback/recording device until Phase 12G.

## 12. Audapp Devices page

**Not tested** — no device/endpoint exists for Core Audio discovery to find.

When a `ROOT\AudappInput` instance exists, re-test with `npm run tauri dev` and the Devices page.

## 13. Certificate trust

VM test cert remains in `LocalMachine\Root` and `LocalMachine\TrustedPublisher` (from Phase 12E).

## 14. Cleanup / rollback

**Driver store change:** `oem9.inf` (Audapp / audiocodec.inf) is installed on the VM.

**Preferred rollback:** Revert VMware snapshot taken after Phase 12E (cleanest).

**Manual cleanup (if snapshot revert is not used):**

```powershell
pnputil /delete-driver oem9.inf /uninstall /force
```

Only use this published name (`oem9.inf`) — do not delete unrelated OEM packages.

No `pnputil /remove-device` was run (no device instance ID exists).

**This session:** Package left in driver store intentionally for Phase 12G planning; no delete performed.

## 15. Limitations

- Root-enumerated device was not created by `pnputil /add-driver ... /install` alone.
- Driver load/runtime, audio endpoints, and Audapp discovery were not validated.
- Device Manager and Audapp UI were not manually exercised.
- Compile-only ACX sample driver may not expose full virtual audio endpoints even after device creation (future phases).

## 16. Git status

```text
branch: main
untracked: Phase 12E–12F reports/prompts, driver package/, signing scripts
no commit
```

## 17. Phase 12G prompt

Generated (package staged, no root device):

```text
docs/superpowers/prompts/2026-05-30-audapp-phase-12g-root-device-creation-plan-prompt.md
```

## 18. Exact next step

Execute **Phase 12G** (root device creation plan) on a fresh VM snapshot if possible. Plan a **single** controlled creation of `ROOT\AudappInput` (e.g. documented `devcon install` or equivalent) without duplicate root devices, then re-run endpoint and Audapp discovery checks.
