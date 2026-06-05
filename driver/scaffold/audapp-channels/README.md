# Audapp Channels scaffold (Phase 21F)

Isolated **compile-only** scaffold for Audapp's separate-root multi-endpoint
virtual render driver. Four root devnodes, one render endpoint each:

```text
ROOT\AudappGeneral -> "Audapp General"
ROOT\AudappMusic   -> "Audapp Music"
ROOT\AudappGame    -> "Audapp Game"
ROOT\AudappBrowser -> "Audapp Browser"
```

## What this is

- The Phase 21E architecture realized as a compile-only scaffold: one INF
  (`AudioChannels.inf`), one shared service/binary (`AudappChannels` /
  `AudappChannels.sys`), four hardware IDs, **render-only** (no capture).
- Each devnode creates exactly one render circuit. The channel is chosen at
  `EvtDeviceAdd` from the per-device HW-key value `AudappChannel` (written by the
  matched INF model section), cross-checked against the devnode hardware id.
- Built on the same Microsoft ACX `AudioCodec` sample base as `audapp-multi`,
  ACX 1.0 only. Microsoft-derived source is gitignored (on-disk only); see
  `.gitignore` and `PROVENANCE.md`.

## What this is not

- not a shipping driver, not installed, not loaded from this scaffold
- does not touch the live `Audapp Input` (oem19) or the `audapp-multi` experiment

## Build (compile-only)

```powershell
cd driver\scaffold\audapp-channels
.\build-channels.ps1                  # -> package\Debug\x64\AudappChannels.sys + AudioChannels.inf
.\Generate-Catalog-channels.ps1       # -> package\Debug\x64\AudappChannels.cat (unsigned)
```

`Sign-Catalog-channels.ps1` is for the later VM install phase (21G) only and is
NOT run during compile-only work. `build-channels.ps1` and the catalog/sign
scripts include identity guards that abort if the INF references
`Audapp Input` / `ROOT\AudappInput` / `Audapp Multi` / `ROOT\AudappMulti`.

## Why separate root devnodes

Windows 10 ACX 1.0 AudioEndpointBuilder derives each render endpoint's display
name from its parent devnode's `DeviceDesc`. Phase 21D proved one devnode cannot
persistently show four distinct names. Four devnodes with four distinct
`DeviceDesc` values produce four distinct, persistent names. See the Phase 21E
spec and the Phase 21F report under `docs/superpowers/`.

## Safety

Read `SAFETY.md` before any future compile or install experimentation.
