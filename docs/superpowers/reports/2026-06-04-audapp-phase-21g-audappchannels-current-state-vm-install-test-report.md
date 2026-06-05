# Audapp — Phase 21G: AudappChannels Current-State VM Install / Endpoint Visibility Test Report

- **Date:** 2026-06-05 (run), filed under 2026-06-04 plan series
- **Phase:** 21G — VM-only install/endpoint-visibility test of the Phase 21F `AudappChannels` compile-only package
- **Worktree:** `C:\Users\musta\Audapp-21B` (branch `codex/phase-21b-multi-endpoint-compile-only`)
- **Mode:** VM-only driver install test, run from current VM state (no pre-revert)
- **Result:** **SUCCESS** — separate-root-devnode architecture produces four distinct, persistent, WASAPI-functional endpoints with no Code 37.

---

## 1. Current-State Snapshot Confirmation

The user confirmed the rollback snapshot for this phase is **`after 21f`** — taken after Phase 21F completed and before any 21G install/devgen/pnputil work. This was acknowledged before any mutating action. The VM was **not** reverted before Phase 21G; the test ran from current state as instructed.

Primary rollback recommendation remains: **revert to snapshot `after 21f`**.

## 2. Baseline Audapp Input State (read-only preflight)

```
ROOT\DEVGEN\AUDAPP12G0001  "Audapp Input"
  Status: OK / Driver is running
  ProblemCode: 0 (CM_PROB_NONE)
  DriverInfPath: oem19.inf
```

Healthy. Confirmed this is the correct test machine.

## 3. AudioMulti Presence (pre-existing noise — not touched)

Present and healthy at baseline; left untouched throughout:

```
ROOT\DEVGEN\AUDAPPMULTI21C0001  "Audapp Multi"
  Status: OK  Service: AudioMulti  ProblemCode: 0  InfPath: oem21.inf
  Endpoints: 4x "Hoparlör (Audapp Multi)" (render) + 1x "Mikrofon (Audapp Multi)" (capture)
```

Driver-store entries for AudioMulti: `oem20.inf`, `oem21.inf` (audiomulti.inf). Untouched.

## 4. Package Identity Verification

Staged package: `C:\Users\musta\Audapp-21B\driver\scaffold\audapp-channels\package\Debug\x64`

Artifacts: `AudappChannels.sys` (73216 B), `AudioChannels.inf` (9058 B), `audappchannels.cat`, `package-manifest.txt`.

INF identity (`AudioChannels.inf`):

| Field | Value |
|---|---|
| Class | MEDIA `{4d36e96c-e325-11ce-bfc1-08002be10318}` |
| Provider | Audapp |
| DriverVer | 06/05/2026, 7.38.33.982 |
| Target | `NTamd64.10.0...19041` |
| Service | `AudappChannels` (single shared service/binary) |
| Hardware IDs | `ROOT\AudappGeneral`, `ROOT\AudappMusic`, `ROOT\AudappGame`, `ROOT\AudappBrowser` |
| DeviceDesc | Audapp General / Music / Game / Browser |
| Interfaces | KSCATEGORY_AUDIO / RENDER / REALTIME (Speaker only) |
| Capture / Microphone | NONE — render-only |

No overlap with `ROOT\AudappInput` / "Audapp Input" / `ROOT\AudappMulti` / "Audapp Multi" (referenced only in header comments). No capture interface. **PASS.**

## 5. Signing / Test-Signing Result

- Baseline: `.cat` and `.sys` unsigned ("No signature found").
- `bcdedit` testsigning: **Yes** (already enabled — no reboot required).
- Elevated session: yes.
- Regenerated catalog via `Generate-Catalog-channels.ps1` → Inf2Cat clean (0 errors / 0 warnings).
- Signed via `Sign-Catalog-channels.ps1 -SignSys` using existing cert
  `CN=Audapp VM Test Code Signing` (thumbprint `C9C96275386BCDA269FE344FE805C4D668C52F86`).
  - `audappchannels.cat`: signed + verified (`signtool verify /pa` → 1 verified, 0 errors).
  - `AudappChannels.sys`: signed.
  - Public cert (re)imported to LocalMachine\Root and LocalMachine\TrustedPublisher.
- No AudioCodec / Audapp Input / AudioMulti files were signed or modified.

## 6. Published OEM Name

```
pnputil /add-driver AudioChannels.inf  ->  Published Name: oem22.inf
  Original Name: audiochannels.inf
  Provider Name: Audapp
  Signer Name:   Audapp VM Test Code Signing
  Driver Version: 06/05/2026 7.38.33.982
  Class: MEDIA
```

oem19.inf (Audapp Input) and oem20/oem21.inf (AudioMulti) remained present and untouched.

## 7. Four AudappChannels Devnode Instance IDs

Created via `devgen` (exactly four, no duplicates):

```
ROOT\DEVGEN\AUDAPPGENERAL0001
ROOT\DEVGEN\AUDAPPMUSIC0001
ROOT\DEVGEN\AUDAPPGAME0001
ROOT\DEVGEN\AUDAPPBROWSER0001
```

`pnputil /add-driver ... /install` reported the driver installed on all four devices; `pnputil /scan-devices` completed clean.

## 8. Driver Start / ProblemCode Result (all four)

```
Audapp General   Status=OK  Service=AudappChannels  ProblemCode=0 (CM_PROB_NONE)
Audapp Music     Status=OK  Service=AudappChannels  ProblemCode=0 (CM_PROB_NONE)
Audapp Game      Status=OK  Service=AudappChannels  ProblemCode=0 (CM_PROB_NONE)
Audapp Browser   Status=OK  Service=AudappChannels  ProblemCode=0 (CM_PROB_NONE)
```

**No Code 37. All four started cleanly.** This is the central result: the separate-root-devnode architecture starts where the single-devnode approach historically failed.

## 9. Endpoint Naming Result

Windows AudioEndpoint friendly names (mmsys.cpl / Sound Output), all Status OK and **distinct**:

```
Hoparlör (Audapp Browser)   SWD\MMDEVAPI\{0.0.0.00000000}.{409B70F2-...}
Hoparlör (Audapp Game)      SWD\MMDEVAPI\{0.0.0.00000000}.{6C156EC3-...}
Hoparlör (Audapp General)   SWD\MMDEVAPI\{0.0.0.00000000}.{76CE6706-...}
Hoparlör (Audapp Music)     SWD\MMDEVAPI\{0.0.0.00000000}.{D38AF2C8-...}
```

Pre-existing noise still visible and ignored: `Hoparlör/Mikrofon (Audapp Input)` (live) and 4x `Hoparlör (Audapp Multi)` + `Mikrofon (Audapp Multi)`. The four new names are distinct from each other and from all noise. **PASS** — this proves the Phase 21E hypothesis (per-devnode DeviceDesc → distinct endpoint name).

## 10. Disable/Enable Persistence Result (performed)

Disabled and re-enabled only the four experimental MEDIA devnodes (Audapp Input and AudioMulti not touched):

- After disable: all four `Error` (expected disabled state).
- After enable: all four `Status=OK`, `Service=AudappChannels`, `ProblemCode=0`, no Code 37.
- Endpoint names re-verified after the cycle: all four `Hoparlör (Audapp ...)` present, distinct, Status OK.

**PASS.**

## 11. Reboot Persistence Result

**Not performed.** A reboot requires explicit user approval and was deferred. Persistence across reboot remains **unverified**.

## 12. WASAPI Probe Result

`cargo run --bin audapp_endpoint_probe` (matches: audapp / audiocodec / hoparlör / mikrofon). 13 endpoints probed.

All four AudappChannels render endpoints passed every step:

```
Hoparlör (Audapp Browser) : Activate OK | GetMixFormat OK (44100Hz 2ch f32) | Initialize OK | Start OK | Stop OK
Hoparlör (Audapp Game)    : Activate OK | GetMixFormat OK (44100Hz 2ch f32) | Initialize OK | Start OK | Stop OK
Hoparlör (Audapp General) : Activate OK | GetMixFormat OK (44100Hz 2ch f32) | Initialize OK | Start OK | Stop OK
Hoparlör (Audapp Music)   : Activate OK | GetMixFormat OK (44100Hz 2ch f32) | Initialize OK | Start OK | Stop OK
```

Audapp Input (render + capture) and the active Audapp Multi endpoints also passed. High Definition Audio Device passed.

Probe summary: 12/13 OK, exit code 1. The single failure is a **stale `not_present` cached "Audapp Multi"** endpoint
(`{32a5c561-...}`, `Activate failed: 0x88890004` = AUDCLNT_E_DEVICE_INVALIDATED) — pre-existing AudioMulti noise, **not** an AudappChannels endpoint and **not** Audapp Input. All Phase 21G target endpoints pass.

## 13. Audapp Input After-Check

```
ROOT\DEVGEN\AUDAPP12G0001  "Audapp Input"
  Driver is running  ProblemCode: 0  DriverInfPath: oem19.inf   (unchanged)
ROOT\DEVGEN\AUDAPPMULTI21C0001  "Audapp Multi"
  Status: OK  Service: AudioMulti  ProblemCode: 0  InfPath: oem21.inf  (unchanged)
```

Audapp Input and AudioMulti both healthy and untouched after the full test.

### Side-effect to flag

After install, `audapp_endpoint_probe` reports **`Audapp Music` as `Default render: true`** — Windows auto-promoted the newly arrived render endpoint to system default. No set-default command was issued by this phase; this is automatic Windows new-device behavior. The `after 21f` snapshot revert undoes it. If keeping the install, the default should be set back manually (mmsys.cpl) to the user's intended device.

## 14. Commands Run (key)

```powershell
# Preflight (read-only)
git -C C:\Users\musta\Audapp status --short
devcon status "@ROOT\DEVGEN\AUDAPP12G0001"
Get-PnpDeviceProperty -InstanceId 'ROOT\DEVGEN\AUDAPP12G0001' -KeyName DEVPKEY_Device_ProblemCode,DEVPKEY_Device_DriverInfPath
Get-PnpDevice | ? { $_.FriendlyName -like '*Audapp Multi*' -or $_.InstanceId -like '*AudappMulti*' }

# Identity / signing
signtool verify /pa /v .\package\Debug\x64\audappchannels.cat   # (initially unsigned)
bcdedit /enum | findstr testsigning                             # Yes
.\Generate-Catalog-channels.ps1
.\Sign-Catalog-channels.ps1 -SignSys

# Publish + create + bind
pnputil /add-driver "...\AudioChannels.inf"                     # oem22.inf
devgen /add /bus ROOT /instanceid AUDAPPGENERAL0001 /hardwareid "ROOT\AudappGeneral"  (x4)
pnputil /add-driver "...\AudioChannels.inf" /install
pnputil /scan-devices

# Verify
Get-PnpDeviceProperty ... DEVPKEY_Device_ProblemCode   (x4 -> 0)
Get-PnpDevice -Class AudioEndpoint | ? FriendlyName -like '*Audapp*'
Disable-PnpDevice / Enable-PnpDevice  (4 experimental devnodes only)
cargo run --bin audapp_endpoint_probe
```

## 15. Rollback Recommendation

- **Primary:** revert VM to snapshot **`after 21f`** (cleanly removes oem22.inf, the four devnodes, the Music-as-default side effect; restores baseline).
- **Manual fallback (AudappChannels only, if snapshot unavailable):**
  ```
  pnputil /delete-driver oem22.inf /uninstall /force
  ```
  Never run delete-driver against `oem19.inf` (Audapp Input) or `oem20/oem21.inf` (AudioMulti).

## 16. Should Phase 21H Proceed?

**Yes — proceed to Phase 21H.** Phase 21G met every success criterion for the target package:

- four devnodes bind/start with ProblemCode 0, no Code 37;
- four distinct, persistent Windows endpoint names;
- names survive disable/enable;
- all four pass WASAPI Activate/GetMixFormat/Initialize/Start/Stop;
- Audapp Input and AudioMulti untouched and healthy.

Open items to carry into 21H: (a) reboot-persistence still unverified; (b) decide intended default-render policy (Audapp Music auto-became default); (c) the architecture is render-only — capture endpoints are out of scope here.

---

### Summary verdict

The separate-root-devnode architecture is validated in the VM. Recommend proceeding to Phase 21H, with reboot-persistence and default-device handling as the next checks.
