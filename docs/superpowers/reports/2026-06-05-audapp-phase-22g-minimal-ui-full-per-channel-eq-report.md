# Audapp Phase 22G — Minimal Product UI + Full Per-Channel EQ

**Date:** 2026-06-08 · **Branch:** `main` (no commit/push performed) · **Build mode:** direct implementation

## Preflight (read-only, no mutation)

- `git branch --show-current` → `main`
- AudappChannels device check → **4 devices**, all `Status OK`, `Problem = CM_PROB_NONE`, `Service AudappChannels`
  (Audapp General / Music / Game / Browser, `ROOT\DEVGEN\AUDAPP*0001`).

No driver / pnputil / devgen / bcdedit / Secure Boot / default-audio / Voicemeeter changes were made.

---

## 1. UI / product changes

- **Equalizer** rebuilt into a product-level per-channel EQ page (channel selector + full EQ per channel + master output protection).
- **Dashboard** converted from mock cards to a live status overview answering "is Audapp working / are channels available / which output / which apps / anything wrong".
- **Select / dropdown** primitive restyled app-wide (rounded surface, elevation, higher dark-mode contrast, softer items) — affects Apps, Equalizer, and channel-rule dropdowns.
- **Mixer** master-DSP card de-bordered, false "per-channel EQ coming in a future phase" note removed, inner app rows switched from bordered to subtle filled surfaces.
- Status now uses filled semantic badges (`success` / `warning` / `destructive` / `info` / `secondary`) instead of outline-only chips.

## 2. Dashboard real-data status — **done**

`dashboard-view.tsx` no longer imports `mock-audio`. It now reads:

- `useMultichannelBridge()` → routing running/stopped, monitor output name, `lastError`, `isPhysicalOutputAudapp`.
- `summarizeAudappChannelEndpoints(discoveryDevices)` (real) → channel availability `X/4`.
- Real discovery devices → default output endpoint.
- Real sessions (`sessionViews`, active + with a device) grouped via `groupSessionsIntoApps` → active-apps list + count.

Renders: a primary status banner (with Start/Stop routing), a 4-up status grid (Routing / Channels / Output / Active apps), an attention/warnings panel, the real `AudappChannelsStatus`, a quick mixer (real channel volumes/mute), and the real active-apps list. App-level mock device/session props were removed (`mockDevices`, `selectedOutputId/InputId` deleted).

## 3. Mixer redesign status — **targeted cleanup** (not a full rebuild)

Removed the master-DSP card border, replaced the obsolete per-channel-EQ limitation note with a pointer to the Equalizer page, and replaced the bordered per-app rows with `bg-muted/40` fills to cut border noise. Channel strips and overall layout were already card-based and were left functionally intact to avoid regressing the working volume/mute/solo wiring.

## 4. Apps / dropdown redesign status — **dropdowns done; Apps layout kept**

The `Select` component (used across Apps + EQ + rules) was redesigned: `rounded-xl` content with `shadow-xl` + subtle ring, padded viewport, `rounded-lg` items with a clear checked state, and a trigger with `shadow-sm`. The Apps page itself was already a clean one-card-per-app product layout (name, requested channel, actual endpoint, activity meter, mute/volume, collapsed advanced rules); it now benefits from the new dropdown styling. Its structure was preserved to keep the session-control wiring stable.

## 5. Full per-channel EQ status — **done (real backend + real UI)**

Each of General / Music / Game / Browser now has an **independent full DSP config**: enable, output gain, high-pass, low-pass, EQ enable, preset, and 5 EQ bands — not just gain.

## 6. Is per-channel EQ real and applied before mix? — **yes**

Audio flow in `multichannel_worker.rs`:

```
each source → its own DspPipeline (gain → HP → EQ → LP)  ← per-channel, BEFORE mix
            → mixer channel volume/mute
            → summed render_out
summed      → master DspPipeline (gain → HP → EQ → LP → limiter)  ← output protection, AFTER mix
            → physical output
```

- Each `SourceStream` owns a `DspPipeline` prepared against that channel's `&'static DspConfigShared`, at the monitor sample rate / source channel count.
- `process_channel_sample` runs the full chain **minus the limiter** (the master limiter after the mix is the single clipping safeguard, so per-channel stages stay transparent when summed).
- Per-channel DSP runs in place even when a channel is muted, so biquad state stays continuous (no transient on unmute).
- Runtime config writes bump a per-channel version; `maybe_refresh()` recomputes coefficients without restarting the bridge.
- The previous gain-only `channel_eq_gain_linear` scalar path was removed (the per-channel pipeline now applies output gain), so gain is not double-applied. Master limiter/output safety is unchanged.

### Backend changes
- `audio_engine/dsp/config.rs`: added `DspConfigShared::new_default()` / `from_config()` and `get_config_from` / `set_config_into` / `set_eq_preset_into` / `get_status_from` so the exact master-DSP logic (clamping, preset detection, version bump) is reused per channel.
- `audio_engine/dsp/pipeline.rs`: added `process_channel_sample` (full chain, no limiter).
- `audio_bridge/channel_dsp.rs`: rewritten from gain-only to full per-channel config backed by four `DspConfigShared` instances; exposes `channel_dsp_shared()` for the worker.
- `audio_bridge/multichannel_worker.rs`: per-source pipeline prepare / `maybe_refresh` / in-place processing before mix / deactivate on stop.
- `bridge_commands.rs` + `lib.rs`: `set_channel_dsp_config` now returns the saved config; added `set_channel_eq_preset` command; registered it.

### Frontend changes
- `types/audio-engine.ts`: `ChannelDspConfig` is now `DspRuntimeConfig & { channelId }`.
- `lib/use-channel-dsp.ts`: rewritten into a full per-channel hook (`config/setConfig/commitConfig/setPreset/reset`) structurally compatible with `DspControls`.
- `components/engine/dsp-controls.tsx`: now accepts a structural `DspControlsModel` (drives both master and per-channel DSP); band edits use the shared `withBandGain` helper.
- `components/eq/equalizer-view.tsx`: product-level page — channel selector (icon segmented buttons) + per-channel `DspControls` + master output-protection `DspControls`.
- `lib/channel-eq.ts`: single source of truth for channel list, default config, label, and immutable band edit (pure, unit-tested).

## 7. (covered in §5/§6 — frontend per-channel EQ)

## 8. Persistence / migration behavior — **done**

- `channel-dsp-config.json` schema bumped **v1 → v2**.
- Missing/invalid file → all four channels get safe defaults (enabled, transparent).
- Loaded configs are merged over defaults so every channel is always present.
- **Legacy v1 (gain-only) files are migrated**: `gainDb` → `outputGainDb`, `enabled` preserved, full EQ bands + filters filled with defaults.
- Writes are atomic (temp file + rename); each set/preset command persists via the app local data dir.
- Configs load and apply on startup (`lib.rs` setup) and apply to the running bridge without restart.

## 9. Tests / build results — **all green**

- `cargo check --manifest-path src-tauri\Cargo.toml` → finished, no errors (pre-existing dead-code warnings only).
- `cargo test --lib` → **98 passed, 0 failed**. New `channel_dsp` tests: defaults contain all four channels; updating Browser doesn't change Music; negative gain attenuation persists; missing file → four defaults; full-config per-channel save/load roundtrip; preset persists independently per channel; **v1 gain-only migration → full configs**.
- `node --test src/lib/*.test.ts` → **69 passed, 0 failed**. New `channel-eq` tests: selector defaults to General; four clean labels; default config flat/enabled/5 bands; independent objects; **editing Browser EQ does not change Music**; band-targeted edits.
- `npm run build` (`tsc && vite build`) → success, 1928 modules, no type errors.

## 10. Manual smoke status — **PENDING (not user-confirmed)**

`npm run tauri dev` was **not** auto-run to completion as a confirmed smoke. The following remain to be confirmed by the user:
1. Dashboard shows real channel/device/routing data.
2. Mixer reads cleaner / controls fit.
3. Apps page + dropdowns look improved.
4. Equalizer shows General/Music/Game/Browser selector.
5. Each channel has full EQ controls (not only gain).
6. Browser EQ changes affect Browser audio.
7. Music EQ changes affect Music audio.
8. Browser and Music settings stay independent.
9. Negative gain still attenuates.
10. Audio stays smooth (no crash/stutter).

## 11. Files changed

Backend: `audio_engine/dsp/config.rs`, `audio_engine/dsp/pipeline.rs`, `audio_bridge/channel_dsp.rs` (rewritten), `audio_bridge/multichannel_worker.rs`, `bridge_commands.rs`, `lib.rs`.
Frontend: `types/audio-engine.ts`, `lib/use-channel-dsp.ts` (rewritten), `lib/channel-eq.ts` (new), `lib/channel-eq.test.ts` (new), `components/engine/dsp-controls.tsx`, `components/eq/equalizer-view.tsx`, `components/dashboard/dashboard-view.tsx`, `components/mixer/mixer-view.tsx`, `components/ui/select.tsx`, `app/App.tsx`.

## 12. Known limitations

- Per-channel DSP defaults to **enabled + transparent**; the `DspControls` panel gates sliders behind the per-channel Enable toggle (consistent with master DSP UX).
- Per-channel pipelines run identity biquads even when transparent (negligible CPU; bit-transparent output).
- Mixer and Apps received targeted polish rather than full structural rewrites, to avoid regressing working session/volume/solo wiring.
- Per-channel EQ has no live status badge in the UI (the hook reports `status: null`); audibility is verified by ear during routing.
- Manual smoke (audio) is unconfirmed — see §10.

## 13. Next step recommendation

Run `npm run tauri dev`, start routing, and confirm the §10 checklist by ear — especially that Browser vs Music EQ edits are independent and audible, and that the master limiter still protects positive-gain clipping. If confirmed, this is a good commit point.
