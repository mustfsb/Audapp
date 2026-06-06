# Audapp — Phase 21A Multi-Endpoint Driver Architecture Plan

> **Status:** Planning only. No code, driver, INF, signing, install, devgen, pnputil, or bcdedit changes were made in this phase.
> **Date:** 2026-06-04
> **Branch:** `main` (no new branch/worktree, per phase constraints)
> **Goal:** Design the safest architecture for later exposing multiple Audapp Windows audio endpoints (Audapp General / Music / Voice / Game) without breaking the current stable single-endpoint stack.

---

## 0. Scope and Constraints

This phase **only** inspects and plans. It does not implement, build, sign, install, remove, or reload any driver. It does not run `devgen`, `devcon install`, `pnputil`, or `bcdedit`. The current working `Audapp Input` virtual endpoint (devnode `ROOT\DEVGEN\AUDAPP12G0001`, `oem19.inf`) is treated as a protected production asset and must remain untouched.

The downstream implementation phases this spec defines:

- **Phase 21B** — multi-endpoint *compile-only* scaffold (no install).
- **Phase 21C** — conservative VM-only install/verify test (later, gated on 21B success and explicit user approval).

---

## 1. Driver Preflight Result

Read-only health check executed from `C:\Users\musta\Audapp`:

| Check | Result |
| --- | --- |
| `git status --short` | Clean except untracked Phase 23A report (expected) |
| `git branch --show-current` | `main` |
| `devcon status @ROOT\DEVGEN\AUDAPP12G0001` | **Driver is running** |
| `devcon stack` | Setup Class `{4d36e96c-...}` **MEDIA**; upper filter `ksthunk`; controlling service **AudioCodec** |
| `Get-PnpDevice` | FriendlyName `Audapp Input`, Status **OK**, Class **MEDIA** |
| `DEVPKEY_Device_ProblemCode` | **0** |
| `DEVPKEY_Device_ProblemStatus` | (empty — healthy) |
| `DEVPKEY_Device_DriverInfPath` | **oem19.inf** |

**Conclusion:** Driver health is fully OK and matches the expected baseline. No remediation needed (and none permitted) in this phase.

---

## 2. Current Scaffold Findings

The scaffold at `driver/scaffold/audapp-input/` is a customized copy of the Microsoft **ACX AudioCodec** sample (Windows Driver Samples, `audio/acx/samples`). Provenance is recorded in `PROVENANCE.md` / `project/import-manifest.json`.

### 2.1 Active build path (what is actually compiled and running)

- **Driver project:** `project/upstream-audiocodec/AudioCodec.vcxproj` → `AudioCodec.sys`, KMDF + ACX, Class MEDIA.
- **Device add (`Device.cpp` → `Codec_EvtBusDeviceAdd`):** creates **one** `CODEC_DEVICE_CONTEXT` holding exactly:
  - `devCtx->Render` via `CodecR_AddStaticRender(device, &CODEC_RENDER_COMPONENT_GUID, &renderCircuitName)`
  - `devCtx->Capture` via `CodecC_AddStaticCapture(device, &CODEC_CAPTURE_COMPONENT_GUID, &MIC_CUSTOM_NAME, &captureCircuitName)`
- **Prepare hardware (`Codec_EvtDevicePrepareHardware`):** attaches each circuit with `AcxDeviceAddCircuit(Device, devCtx->Render)` and `...Capture)`. Each is guarded individually (`if (devCtx->Render != nullptr)`).
- **Render circuit (`Common/RenderCircuit.cpp` → `CodecR_CreateRenderCircuit`):** builds a standard render circuit:
  - `AcxCircuitInitSetComponentId(circuitInit, ComponentGuid)` — per-circuit component GUID.
  - `AcxCircuitInitAssignName(circuitInit, CircuitName)` — per-circuit device name.
  - `AcxCircuitInitSetCircuitType(..., AcxCircuitTypeRender)`.
  - Host pin (sink, `KSCATEGORY_AUDIO`) + bridge pin (source, `KSNODETYPE_SPEAKER`) + jack + volume/mute elements + supported formats (44100/48000 stereo).
- **Compiled circuit source present:** only `Common/RenderCircuit.cpp` and `Common/CaptureCircuit.cpp` (the single-circuit `Codec*` variants). Confirmed build artifacts: `renderCircuit.obj`, `captureCircuit.obj`.

### 2.2 Latent multi-circuit prototypes (declared, not implemented in scaffold)

`shared/Public.h` already declares the upstream sample's **richer multi-circuit contexts and prototypes**, but their `.cpp` bodies are **not** present in this scaffold (no `Dsp.cpp`, `SpeakerCircuit.cpp`, `RenderMC*.cpp`, etc.):

- `DSP_DEVICE_CONTEXT` — holds **five** circuits in one device: `Speaker`, `MicArray`, `SpeakerHp`, `MicrophoneHp`, `HDMI`.
- `CODECMC_DEVICE_CONTEXT` — multicircuit codec with `ACXCOMPOSITETEMPLATE Composite[2]` (render + capture composites).
- `DSPMC_DEVICE_CONTEXT` — multicircuit DSP using ACX **factory circuits**.
- Prototypes incl. `Speaker_AddStaticRender`, `SpeakerHp_AddStaticRender`, `HDMI_AddStaticRender`, and crucially **`RenderMC_AddStaticRender(... const UNICODE_STRING* CircuitName, const UNICODE_STRING* Uri)`** — the `Uri` argument is the ACX pattern for giving each circuit a distinct endpoint identity.

**Significance:** This proves multi-circuit-per-device is a first-class, sample-supported ACX pattern. The upstream `DSP` variant is a canonical, working example of **3 render + 2 capture endpoints on a single PnP devnode** — exactly the topology Audapp needs. Phase 21B can port those bodies rather than invent new code.

### 2.3 Current INF (`AudioCodec.inf`)

- Single root device: `%AudioCodec.DeviceDesc%=Audio_Device, ROOT\AudappInput` (Class MEDIA, KMDF, `DriverVer ...,1.0.0.0`, `PnpLockDown=1`).
- One render interface section `[Audio_Device.I.Speaker]` (FriendlyName `Audapp Input Speaker`, reference string `KSNAME_Speaker="Speaker0"`).
- One capture interface section `[Audio_Device.I.Microphone]` (`Microphone0`).
- `[Audio_Device.NT.Interfaces]` adds each interface under `KSCATEGORY_AUDIO` + render/capture + realtime categories, keyed by reference string.
- **Endpoint identity model:** Windows publishes one MMDevice endpoint per `AddInterface` reference string; the per-endpoint **FriendlyName** comes from that interface's `AddReg`. Multiple endpoints therefore require multiple reference strings + multiple `[Audio_Device.I.*]` FriendlyName sections, each bound to a corresponding circuit.

### 2.4 Build / packaging tooling

`build.ps1`, `prepare.ps1`, `Apply-PackageIdentity.ps1`, `Generate-Catalog.ps1`, `Sign-Catalog.ps1`, `BUILD.md`. `SAFETY.md` states: compile-only, no install/load on primary machine, VM only for future install work — consistent with the Phase 21B/21C split.

### 2.5 ACX version constraint (from memory)

Per project memory `driver-acx-version-constraint`: this Win10 19045 box must build for **ACX 1.0** (ACX 1.1 → Code 37). Phase 21B/21C must preserve the current ACX 1.0 targeting and not bump it.

---

## 3. ACX Topology Assessment

Direct answers to the Phase 21A topology questions, grounded in the scaffold:

| Question | Answer | Evidence |
| --- | --- | --- |
| Can one ACX device expose multiple render circuits/endpoints? | **Yes.** | `DSP_DEVICE_CONTEXT` holds Speaker + SpeakerHp + HDMI render circuits on one device; ACX supports N circuits per device, attached via repeated `AcxDeviceAddCircuit`. |
| Can one root devnode produce multiple MMDevice render endpoints? | **Yes**, given one circuit + one INF `AddInterface` reference string + FriendlyName per endpoint. | INF endpoint model in §2.3; each circuit's bridge pin + KSCATEGORY_AUDIO interface → one endpoint. |
| Does current code create both render and capture circuits already? | **Yes** — one render + one capture today. | `Codec_EvtBusDeviceAdd` calls both `CodecR_AddStaticRender` and `CodecC_AddStaticCapture`. |
| Minimal change to create multiple render circuits? | Hold an array of render circuits; call `CodecR_CreateRenderCircuit` once per channel with a **distinct component GUID + distinct circuit name** each; attach each in PrepareHardware; add matching INF interface/FriendlyName sections. | `CodecR_CreateRenderCircuit` is already parameterized by `ComponentGuid` and `CircuitName`. |
| Likely INF/topology requirements? | Per endpoint: a unique reference string (e.g. `SpeakerGeneral`/`SpeakerMusic`/...), a dedicated `[Audio_Device.I.*]` FriendlyName section, and `AddInterface` lines under `KSCATEGORY_AUDIO`/`KSCATEGORY_RENDER`/`KSCATEGORY_REALTIME`. Each reference string must bind to its circuit's bridge pin. | §2.3; upstream DSP sample INF is the reference implementation. |

**Key architectural finding:** The hard part is **not** the C++ circuit creation (the loop is trivial and already parameterized). The hard part — and the main unknown — is the **INF ↔ circuit binding**: ensuring each of the N circuits surfaces as its own named endpoint with the correct FriendlyName. The upstream DSP sample's INF is the authoritative template for this and must be studied/ported in 21B.

---

## 4. Option Comparison

### Option A — Single root device, multiple render circuits *(recommended default)*

```
ROOT\AudappInput  (one devnode, one package, one oem*.inf)
   ├── Render circuit "Audapp General"  → endpoint
   ├── Render circuit "Audapp Music"    → endpoint
   ├── Render circuit "Audapp Voice"    → endpoint
   ├── Render circuit "Audapp Game"     → endpoint
   └── Capture circuit "Audapp Input Microphone" (unchanged)
```

- **Pros:** One driver instance, one package, one install/remove surface. Directly matches the supported ACX `DSP_DEVICE_CONTEXT` pattern. Cleanest long-term model; no duplicate-package matching problems. Circuit-creation code is a trivial loop over already-parameterized helpers.
- **Cons:** All endpoints share one devnode lifecycle (one PrepareHardware); a bug can affect all endpoints at once. INF ↔ circuit binding for N endpoints is the main complexity. Per-endpoint FriendlyName wiring must be exact.

### Option B — Multiple root device instances, one endpoint each

```
ROOT\AudappGeneral  → "Audapp General"
ROOT\AudappMusic    → "Audapp Music"
ROOT\AudappVoice    → "Audapp Voice"
ROOT\AudappGame     → "Audapp Game"
```

- **Pros:** Per-endpoint isolation (one devnode failing need not kill others); each instance is the simple single-circuit code we already ship.
- **Cons:** Four devnodes to create/manage; four `devgen`/install/remove operations; duplicate-package / hardware-ID matching complexity; harder rollback; more user confusion in Device Manager; four idle/power lifecycles. Higher cumulative install risk and Code 37 surface.

### Option C — Stay single endpoint, keep user-mode internal channels *(current model)*

- **Pros:** **Lowest driver risk.** Zero kernel changes. Continues the proven, stable Phase 17A–23A stack. Internal channels (`general`/`music`/`voice`/`game`) keep working as mixer groups.
- **Cons:** Windows will not show separate endpoints; apps cannot independently target an Audapp channel from the Windows sound picker.

### Option D — Hybrid *(recommended sequencing)*

- The stable `Audapp Input` package remains the **default, untouched production driver**.
- Multi-endpoint work happens as a **separate, differently-named, separately-versioned experimental package** developed compile-only (21B) and tested only in a VM (21C).
- Promotion to default happens only after VM validation and explicit user approval.

**Recommendation:** Adopt **Option A as the target topology**, sequenced via **Option D's safety discipline**. Until 21C passes in a VM, the live product continues on **Option C** (current single endpoint + user-mode channels). I.e. *design toward A, ship behind D, fall back to C.*

---

## 5. Recommended Architecture

**Target:** One root device (`Option A`) exposing four render endpoints, developed and rolled out under `Option D` isolation, with `Option C` remaining the live default until VM-proven.

Concrete shape for Phase 21B compile target:

1. **Device context:** Replace the two-field `CODEC_DEVICE_CONTEXT` with a context holding an **array of render circuits** (size 4) plus the existing single capture circuit (capture multi-endpoint deferred to a later phase).
2. **Channel table:** A static table of `{ id, circuit-name, component-GUID, inf-reference-string, friendly-name }` for General / Music / Voice / Game. Component GUIDs must each be **unique and newly generated** (never reuse the existing render component GUID, to avoid identity collisions with the shipping driver).
3. **Creation loop:** In `EvtBusDeviceAdd`, loop the table calling `CodecR_CreateRenderCircuit` (or ported `RenderMC_AddStaticRender` with `Uri`) once per channel; store each handle in the array.
4. **Attach loop:** In `EvtDevicePrepareHardware`, loop `AcxDeviceAddCircuit` for each non-null render circuit, each individually guarded (mirroring the existing null-guard pattern).
5. **INF:** Four render interface sections, each with a unique reference string and distinct FriendlyName (`Audapp General` … `Audapp Game`), all under a **new package identity** (new device hardware ID like `ROOT\AudappMulti`, new `DeviceDesc`, bumped `DriverVer`), so it never matches or overwrites `oem19.inf` / `ROOT\AudappInput`.
6. **Naming:** Endpoint *base* names are the localized speaker noun chosen by Windows (e.g. `Hoparlör (...)` on a Turkish system); the **stable token** Audapp relies on is the parenthetical / FriendlyName suffix `Audapp General` etc. Audapp discovery must key off the `audapp <channel>` token, never the localized prefix (see §10).

---

## 6. Risk Table

Ratings: 🟢 low · 🟡 medium · 🔴 high. "21B" = compile-only; "21C" = VM install.

| Risk | Option A (target) | Option B | Phase 21B (compile) | Phase 21C (VM install) |
| --- | --- | --- | --- | --- |
| Compile risk | 🟡 (new context + INF) | 🟡 | 🟡 | n/a |
| Install risk | 🟡 | 🔴 (×4 devnodes) | 🟢 (no install) | 🟡 |
| Code 37 risk (ACX ver / binding) | 🟡 | 🟡 | 🟢 | 🔴 (primary watch item) |
| Endpoint visibility / FriendlyName risk | 🟡 (INF binding) | 🟡 | 🟢 (static check only) | 🔴 (must verify all 4 appear) |
| BSOD / boot instability | 🟡 | 🟡 | 🟢 (no load) | 🔴 (VM snapshot mandatory) |
| Rollback complexity | 🟢 (one package) | 🔴 (×4) | 🟢 | 🟡 |
| Impact on shipping `Audapp Input` | 🟢 if new identity | 🟡 | 🟢 (separate package) | 🟢 if separate package |
| VM snapshot requirement | — | — | not required | **required (hard gate)** |

**Top three watch items:** (1) ACX 1.0 targeting must be preserved — ACX 1.1 = Code 37 on this box; (2) INF↔circuit FriendlyName binding for 4 endpoints is unproven in this scaffold; (3) never let the new package match the existing `ROOT\AudappInput` hardware ID.

---

## 7. Rollback Strategy

Rules binding on all future phases (21B/21C and beyond):

1. **Snapshot before any driver package mutation.** No package build that will later be installed proceeds without a VM snapshot taken first (21C). 21B writes no installable-into-live artifacts.
2. **Never delete the working `oem19.inf`** except inside an explicit, user-approved rollback phase. It is the production driver for `ROOT\AudappInput`.
3. **Install the multi-endpoint package under a separate name/version/hardware-ID** (`ROOT\AudappMulti`, new `DeviceDesc`, bumped `DriverVer`). It must not share identity with `Audapp Input`.
4. **Keep the known-good `Audapp Input` package fully untouched** on disk and in the driver store throughout 21B/21C.
5. **`pnputil /delete-driver` is a manual, documented rollback step only** — never automated, never run in 21A/21B.
6. **Code 37 / missing-endpoint = immediate stop.** Revert to snapshot; do not iterate on a live driver store.
7. **Live product stays on Option C** (single endpoint) until 21C passes and the user explicitly approves promotion.

---

## 8. Phase 21B — Multi-Endpoint Compile-Only Plan

> **For agentic workers:** This is the implementation plan for a *future* compile-only phase. Do **not** execute it during Phase 21A. When executed, use `superpowers:executing-plans` or `superpowers:subagent-driven-development`. No install, no devgen, no pnputil, no bcdedit, no signing beyond catalog generation needed to compile/stage.

**Goal:** Produce a compilable `.sys` + `.inf` package that *defines* four render endpoints on a single device, staged to an output folder, with the shipping `Audapp Input` package left byte-for-byte untouched.

**Architecture:** Extend the existing single-render `Codec` path to an array of four render circuits driven by a static channel table; add a separate-identity INF with four render interface sections. Preserve ACX 1.0. Capture stays single.

**Tech stack:** C++ / KMDF / ACX 1.0, WDK msbuild (`build.ps1`), Windows INF.

### Task 1 — Branch/worktree isolation for the experimental driver

- **Files:** none (git only).
- [ ] Create an isolated worktree via `superpowers:using-git-worktrees` so the experimental driver never touches `main`'s shipping scaffold in place.
- [ ] Confirm `git status` clean before edits.
- **Acceptance:** Work happens off `main`; shipping `driver/scaffold/audapp-input/` on `main` is unmodified.

### Task 2 — Define the channel table (single source of truth)

- **Files:** Create `driver/scaffold/audapp-multi/shared/Channels.h` (new tree, copied from `audapp-input`).
- [ ] Define an array of 4 entries: `{ InternalId, CircuitName (UNICODE_STRING), ComponentGuid (newly generated GUID), InfRefString, FriendlyName }` for General/Music/Voice/Game.
- [ ] Generate four **fresh** component GUIDs (do not reuse `CODEC_RENDER_COMPONENT_GUID`).
- **Acceptance:** Header compiles standalone; four distinct GUIDs; names match the INF reference strings exactly (string-for-string).

### Task 3 — Extend the device context to N render circuits

- **Files:** Modify `audapp-multi/shared/Public.h` (context struct), `audapp-multi/project/.../Device.cpp`.
- [ ] Replace single `ACXCIRCUIT Render` with `ACXCIRCUIT Render[4]` (or a small fixed array) in the device context; keep `Capture` single.
- [ ] In `EvtBusDeviceAdd`, loop the channel table calling `CodecR_CreateRenderCircuit(device, &table[i].ComponentGuid, &table[i].CircuitName, &Render[i])`. Preserve all existing trace/error patterns and the `AUDAPP_DIAG_STARTUP_BISECT` guards.
- **Acceptance:** `cargo`/driver msbuild compiles; static review shows four creates with distinct GUID+name; no reuse of the production component GUID.

### Task 4 — Attach all render circuits in PrepareHardware

- **Files:** Modify `Device.cpp` (`*_EvtDevicePrepareHardware`), `*_EvtDeviceReleaseHardware`.
- [ ] Loop `AcxDeviceAddCircuit(Device, Render[i])` for each non-null entry, each individually null-guarded (mirror existing pattern at `Device.cpp:346`).
- [ ] Mirror removal in ReleaseHardware for each circuit.
- **Acceptance:** Compiles; every create has a matching add and remove; guards present.

### Task 5 — Author the four-endpoint INF under a new identity

- **Files:** Create `audapp-multi/.../AudioMulti.inf` (do not edit `AudioCodec.inf`).
- [ ] New hardware ID `ROOT\AudappMulti`, new `DeviceDesc` (e.g. `Audapp Multi`), bumped `DriverVer` (e.g. `2.0.0.0`), `PnpLockDown=1`, Class MEDIA, KMDF.
- [ ] Four render interface sections `[Audio_Device.I.SpeakerGeneral]` … `[...Game]`, each with its own FriendlyName (`Audapp General` … `Audapp Game`) and unique reference string.
- [ ] Add all four under `KSCATEGORY_AUDIO` / `KSCATEGORY_RENDER` / `KSCATEGORY_REALTIME` in `[Audio_Device.NT.Interfaces]`.
- [ ] Keep one capture section unchanged.
- **Acceptance:** `inf2cat` / build-time INF validation passes (compile/stage only); reference strings exactly match `Channels.h`; no string overlaps `ROOT\AudappInput`, `Audapp Input`, or `oem19.inf`.

### Task 6 — Port the upstream DSP multi-endpoint INF binding (research + apply)

- **Files:** read upstream DSP sample INF (referenced by `Public.h` `DSP_DEVICE_CONTEXT`); apply pattern to `AudioMulti.inf`.
- [ ] Confirm how the DSP sample binds each circuit's bridge pin to its interface reference string and FriendlyName; replicate exactly for the four render circuits.
- [ ] Document the binding mechanism inline in the INF as comments.
- **Acceptance:** Written rationale in the 21B report explaining how each of the four endpoints gets its FriendlyName; this resolves Known Unknown #1 (§11).

### Task 7 — Compile and stage the package

- **Files:** `audapp-multi/build.ps1`, output staging dir.
- [ ] Build `AudioMulti.sys` + `AudioMulti.inf` to a **staging output folder only** (no driver-store copy, no install).
- [ ] Generate catalog only if required for the build to complete; test-signing only if required to *build*, never to install.
- **Acceptance criteria (all required):**
  - msbuild succeeds for `AudioMulti.sys` (ACX 1.0, x64).
  - `AudioMulti.inf` passes build-time validation.
  - Staging folder contains `.sys` + `.inf` (+ `.cat` if generated).
  - **Zero** changes to `driver/scaffold/audapp-input/` on `main`, `oem19.inf`, or the live driver store.
  - **No** `devgen`, `pnputil`, `devcon install`, or `bcdedit` invocation anywhere in the phase.
  - Live `ROOT\DEVGEN\AUDAPP12G0001` still reports ProblemCode 0 after the phase (re-run preflight).

### Task 8 — 21B report

- **Files:** Create `docs/superpowers/reports/<date>-audapp-phase-21b-multi-endpoint-compile-report.md`.
- [ ] Record build output, staged artifacts, the INF-binding mechanism (Task 6), and confirmation the live driver was untouched.
- **Acceptance:** Report exists; explicitly states whether 21C should proceed.

---

## 9. Phase 21C — VM Install-Test Outline (later, do not implement now)

Conservative, VM-only, gated on 21B success **and** explicit user approval.

1. **VM only.** Never on the primary machine. (`SAFETY.md` already mandates this.)
2. **Snapshot first** — hard gate. No install before a clean snapshot exists.
3. **Enable test-signing** in the VM (`bcdedit /set testsigning on` — VM only, documented, reversible).
4. **Install the separate-identity package** (`AudioMulti.inf`) via `pnputil /add-driver`. The shipping `Audapp Input` package remains installed and untouched.
5. **Create/bind one device** if needed (`devgen` for `ROOT\AudappMulti`) — one devnode, four circuits.
6. **Verify endpoints:** all four (`Audapp General/Music/Voice/Game`) appear via `IMMDeviceEnumerator` (use `audapp_endpoint_probe`), each with correct FriendlyName, each playable.
7. **Stop on Code 37 or any missing endpoint** — revert to snapshot immediately; do not iterate live.
8. **Rollback path:** revert snapshot is primary; `pnputil /delete-driver` of the *multi* package is the documented manual fallback. Never touch the `Audapp Input` package.
9. **Promotion** to live default requires a separate, explicitly-approved phase.

---

## 10. App Endpoint-to-Channel Mapping Plan

### 10.1 Current discovery (evidence)

- `src-tauri/src/audio/devices.rs` enumerates endpoints via `IMMDeviceEnumerator` + reads `PKEY_Device_FriendlyName`.
- Existing Audapp-device matching already uses a **localization-independent substring**: `get_friendly_name().to_lowercase().contains("audapp")` (`audio_bridge/worker.rs:927`, `voice_lab/worker.rs:676`). The localized `Hoparlör` prefix is **not** relied upon today — good baseline.
- Internal channels are defined in `src/lib/internal-channels.ts` as `general | music | voice | game` with labels `Audapp General/Music/Voice/Game`.

### 10.2 Mapping design (future, when endpoints exist)

1. **Stable token, not localized prefix.** Map by parsing the channel token from the FriendlyName: lowercase, then match `audapp general|music|voice|game`. Never depend on `Hoparlör`/`Speakers`/`Lautsprecher` prefixes.
2. **Prefer hard metadata over display name** where available: the per-circuit **component GUID** (from `Channels.h`) and/or the endpoint's device-interface reference string are language-invariant. Plan to read these (e.g. via `PKEY_AudioEndpoint_Association` / device topology / instance path) as the primary key, with FriendlyName token as fallback.
3. **Explicit mapping table** mirrored on both sides:
   ```
   "Audapp General" endpoint  ↔ component GUID G_GENERAL ↔ internal channel "general"
   "Audapp Music"   endpoint  ↔ component GUID G_MUSIC   ↔ internal channel "music"
   "Audapp Voice"   endpoint  ↔ component GUID G_VOICE   ↔ internal channel "voice"
   "Audapp Game"    endpoint  ↔ component GUID G_GAME    ↔ internal channel "game"
   ```
   The driver `Channels.h` GUIDs are the single source of truth; the Rust/TS side gets a matching constant table.
4. **Graceful degradation:** if the multi-endpoint driver is absent (Option C live), discovery finds no per-channel endpoints and the app continues with user-mode mixer grouping exactly as today. No hard dependency on the new endpoints.
5. **No new localized assumptions:** keep all matching on `contains("audapp")` + channel token; treat the localized noun as cosmetic only.

---

## 11. Known Unknowns

1. **INF↔circuit FriendlyName binding for N endpoints.** The scaffold has never built a multi-render-endpoint INF. The exact mechanism that maps circuit *i* to interface reference string *i* and its FriendlyName must be confirmed from the upstream DSP sample (21B Task 6). **Highest-uncertainty item.**
2. **Per-circuit component GUID uniqueness requirements.** Assumed each circuit needs its own component GUID; must confirm ACX does not require additional per-endpoint identifiers to avoid endpoint coalescing.
3. **ACX 1.0 multi-circuit parity.** The richer `DSP`/`MC` samples may assume a newer ACX. Must verify the four-render pattern compiles and binds under ACX 1.0 (the Code-37-safe version on this box). The simple "array of `CodecR_CreateRenderCircuit`" approach is preferred precisely because it stays on the proven ACX 1.0 single-circuit API.
4. **Capture multi-endpoint.** Deferred. Whether Audapp later needs per-channel capture endpoints is an open product question; this plan keeps capture single.
5. **`devgen` vs INF root-enumerated install.** Current live device is `ROOT\DEVGEN\...` (devgen-created). Whether the multi package should be devgen-created or INF-root-enumerated in the VM is a 21C decision; either way it uses a new hardware ID.
6. **Endpoint default/role behavior.** With four render endpoints, which (if any) should be eligible as Windows default is undecided; likely none auto-default, to avoid hijacking the user's default device.

---

## 12. Final Recommendation

**Proceed — to Phase 21B (compile-only) only, under strict isolation. Keep the live product on Option C until 21C passes in a VM.**

- The desired multi-endpoint topology (**Option A**) is genuinely supported by ACX and partially pre-scaffolded (upstream `DSP_DEVICE_CONTEXT` proves 3 render + 2 capture on one devnode; `RenderMC_AddStaticRender` carries a per-endpoint `Uri`). Risk is **manageable** because the circuit-creation code is already parameterized and the change is largely additive.
- The single real area of uncertainty is the **INF↔endpoint binding**, which is a compile-time/static concern — perfectly suited to the **no-install Phase 21B**, where it can be resolved with zero risk to the running system.
- All kernel-load risk is deferred to **Phase 21C in a VM**, behind a mandatory snapshot, a separate package identity, and a hard "stop on Code 37" rule, with the shipping `Audapp Input` driver left untouched.
- Until 21C is proven and explicitly approved, the live app continues exactly as today (single endpoint + user-mode channels), so **there is no risk to the current stable stack from adopting this plan.**

**Verdict:** ✅ Proceed to design/compile (21B). ⏸ Pause before any install (21C is VM-only, separately approved). 🔒 Live product unchanged (Option C) in the meantime.
