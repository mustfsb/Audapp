# SYSVAD vs ACX — decision record for Audapp

**Phase 11B:** Decision documentation only — no driver code.

## Problem statement

Audapp needs a **kernel-mode** virtual audio endpoint so arbitrary Windows applications can select **Audapp Input** (or future multi-channel endpoints) as their playback device. User-mode APIs cannot register a true MMDevice endpoint.

Two Microsoft-relevant paths:

1. **SYSVAD-style** — PortCls miniport, WaveRT, classic virtual audio sample (`sysvad` in Windows Driver Samples).
2. **ACX** — Audio Class Extensions on **KMDF/WDF**, Microsoft’s newer model for audio drivers.

## Comparison

| Dimension | SYSVAD / PortCls / WaveRT | ACX (Audio Class Extensions) |
|-----------|---------------------------|--------------------------------|
| Microsoft direction | Mature, maintained samples; not the “new driver” default | **Current recommended path** for new audio drivers |
| Framework | PortCls miniport + WaveRT buffers | WDF + ACX classes (circuits, streams, jack/endpoint abstractions) |
| Learning curve | Large legacy surface; sample maps closely to “virtual cable” mental model | Steeper initially; less boilerplate once patterns are known |
| Reference material | **Excellent** — SYSVAD is the canonical virtual-audio walkthrough | Growing — ACX docs + ACX audio samples; fewer “virtual cable clone” tutorials |
| Virtual endpoint pattern | Directly demonstrated (render + capture endpoints) | Supported via ACX circuits; map SYSVAD topology mentally |
| Long-term maintenance | Supported but carries PortCls baggage | Aligns with WDF investment and future Windows audio stack |
| Audapp fit | **Structural reference** for “one render endpoint, apps write audio here” | **Implementation target** for Audapp-owned driver |

## Microsoft’s newer direction

**ACX** is the forward-looking framework: WDF-based, class extensions for circuits, streams, and power management. New audio driver guidance and samples increasingly assume WDF/ACX rather than teaching greenfield PortCls miniports from scratch.

**SYSVAD** remains the best **end-to-end virtual device sample** for understanding:

- How a virtual render endpoint appears in Sound settings
- How WaveRT buffers move through the miniport
- How capture/render endpoints are exposed to the audio engine

## Audapp long-term target

```text
target ACX, reference SYSVAD virtual-audio pattern
```

| Role | Choice |
|------|--------|
| **Build target** | ACX driver project (Phase 11C+ scaffold) |
| **Architecture reference** | SYSVAD virtual-audio topology (endpoint count, buffer flow, “app plays here → driver receives PCM”) |
| **First POC endpoint** | Single render endpoint: **Audapp Input** (Phase 11A / 11C) |

Multi-endpoint future (`Audapp Game`, `Chat`, etc.) is **deferred** (Phase 12A). One endpoint bounds complexity and signing risk.

## How SYSVAD is still used without “choosing PortCls”

Use SYSVAD to answer:

- What does Windows enumerate as device IDs?
- How does `probe_device_formats()` in Audapp see the endpoint? (Same as any WASAPI device — no app change to discovery.)
- What is the minimal “accept audio / render-to-null” milestone for 11C?

Reimplement that **behavior** in ACX, not by forking SYSVAD PortCls code into production unless a spike proves ACX blockers.

## What Phase 11C must validate before committing

| Validation | Pass criteria |
|------------|---------------|
| ACX sample builds on team WDK | Clean compile of chosen ACX audio sample |
| Virtual render endpoint | **Audapp Input** appears in Windows Sound + Audapp device probe |
| Audio acceptance | Driver receives render stream (11C may use render-to-null internally) |
| No transport yet | Driver↔app bridge deferred to 11D |
| Isolation | Build does not touch Cargo/Tauri; install only on VM with approval |
| Fallback | User-mode Routing Lab + Voicemeeter path remains product fallback |

If ACX virtual-endpoint POC is blocked (missing APIs, sample gaps, team WDF skill), **stop** and run a time-boxed PortCls/SYSVAD compile-only spike **only on VM** to compare — document outcome in 11C notes. Do not commit to PortCls for production without explicit review.

## Explicit non-goals (11B / early 11C)

- APO / system-wide processing
- Automatic per-app routing without user device selection
- Multi-device mixer buses in the driver
- Production shared-memory transport (11D+)

## Summary

| Question | Answer |
|----------|--------|
| Which is Microsoft’s newer direction? | **ACX** |
| Which has better virtual-audio sample material? | **SYSVAD** (reference) |
| What should Audapp target? | **ACX implementation**, **SYSVAD pattern reference** |
| When is the decision final? | After **Phase 11C** compile-only POC on VM |

See also: [driver-app-transport.md](driver-app-transport.md), [phase-11c-go-no-go.md](phase-11c-go-no-go.md).
