# Driver ↔ Audapp user-mode transport design

**Phase 11B:** Design only — no IOCTL handlers, no shared memory, no app changes.

## Context: what the driver replaces

Today’s proven path:

```text
Third-party virtual cable (capture device)
  → Routing Lab duplex worker (WASAPI capture)
  → F32Ring (~200 ms)
  → DspPipeline::process_routing_sample (per channel)
  → WASAPI render to physical output
```

Future path:

```text
Audapp Input (driver render endpoint)
  → [NEW: driver ↔ app transport]
  → same F32Ring + DSP + render path
```

The driver’s job in early integration is **only to supply PCM** that today enters from `eCapture` on a virtual cable. Ring buffer, DSP/EQ, metering, and shutdown semantics in `src-tauri/src/audio_engine/routing/` stay intact.

## Transport options compared

| Transport | Latency | RT-safety | Complexity | Permissions | Reliability | Audapp fit |
|-----------|---------|-----------|------------|-------------|-------------|------------|
| **Buffered IOCTL** read/write | Medium (syscall per chunk) | Good — fixed buffers, no hot-path alloc in app if sized right | **Low–medium** | Open driver device handle; standard `DeviceIoControl` | High | **POC recommended** |
| **Shared-memory ring + events** | **Lowest** | **Best** — matches existing `F32Ring` model | **High** (kernel MDL, map to user, lifetime, teardown) | Driver + app cooperation | High once correct | **Production target** |
| **Named pipe** | Medium | OK in user mode | Medium | App-level | Medium | Poor from kernel; needs **user-mode helper** |
| **Kernel streaming / AVStream** | Low | Best in theory | **Very high** | Driver | High | Overkill for POC |
| **User-mode Windows service** | Medium | Good | Medium–high | Service install + driver handle | Survives app restart | Optional later |

## Phase 11A recommendation (adopted here)

```text
POC transport:     buffered IOCTL polling
Production target: shared-memory ring buffer + event signaling
```

Optional later: user-mode service owns the driver handle and bridges to the Tauri process if the driver must outlive the UI.

## Buffered IOCTL (POC — Phase 11D)

### Shape

- Audapp opens the driver device (`\\.\AudappAudio` or similar, name TBD in 11C).
- Overlapped `DeviceIoControl` with IOCTLs such as:
  - `READ_AUDIO_BUFFER` — driver copies captured render-stream PCM into user buffer
  - `GET_FORMAT` — sample rate, channels, frame size
  - `GET_STATUS` — underrun/overrun, glitch counters (mirror Routing Lab metrics)
- App thread loops with timing similar to today’s `sleep(half_buffer_period)` in `duplex.rs`.

### Why it fits Audapp now

| Reason | Detail |
|--------|--------|
| Matches existing worker | Duplex worker already polls; no WASAPI event-driven capture yet |
| Lower kernel risk | No cross-process MDL mapping in first bridge |
| Debuggable | IOCTL boundaries are easy to log in dev builds |
| Incremental | 11C can compile endpoint with **no transport**; 11D adds IOCTL |

### Tradeoffs

- Higher per-chunk CPU and latency vs shared memory
- Buffer sizing must avoid excessive copies
- Not the final low-latency solution for competitive gaming/streaming latency

## Shared-memory ring + events (production)

### Shape

- Driver allocates non-paged (or suitable) buffer + registers an event per direction.
- User mode maps the section (or uses driver-provided mapping IOCTL once at start).
- Layout mirrors `audio_engine/routing/ring.rs` concepts: interleaved f32, read/write indices, underrun/overrun atomics.
- Signal event when new frames are available; app waits with bounded timeout (or hybrid poll for POC parity).

### Why production

| Reason | Detail |
|--------|--------|
| Reuse mental model | Existing `F32Ring` is already RT-safe and preallocated |
| Latency | Avoids per-period copy through IOCTL buffers |
| Glitch resistance | Event-driven wake reduces timer jitter vs pure sleep polling |

### Tradeoffs

- Correct teardown is hard (app crash while driver holds buffer)
- Security: validate mapped sizes, seal IOCTLs, least privilege on device ACL
- Requires careful IRQL and synchronization review

## Named pipe and service helper

- **Named pipe:** Natural for app↔app, awkward kernel↔app without a **user-mode service** reading IOCTL and forwarding to pipe.
- **Service helper:** Useful if driver handle must persist across Tauri restarts or for elevated install once while app stays unelevated. Adds another installable component — defer until POC proves need.

## Latency and real-time safety

| Layer | Requirement |
|-------|-------------|
| Driver ISR/DPC | No blocking; minimal work; queue to worker thread |
| Transport hot path | No heap allocation; fixed frame sizes |
| Audapp routing worker | Already: `process_routing_sample` uses atomics, no locks in per-sample path |
| End-to-end | Report `estimated_latency_ms`, underrun/overrun like `AudioRoutingRuntimeStatus` |

Production goal: shared-memory ring + events ≤ or better than current ~20 ms WASAPI buffers + ring cushion, subject to 11E measurement.

## Permissions and security

| Topic | Guidance |
|-------|----------|
| Device object ACL | Restrict to authenticated users or app-specific SID later; avoid world-writable |
| IOCTL surface | Small, validated buffer lengths; no arbitrary kernel pointers from user mode |
| IOCTL codes | Use `CTL_CODE` with strict size checks; fuzz in 11D |
| Elevation | Driver install = admin; **Audapp audio processing = non-admin** |

## Reliability

- Driver must survive app exit: stop DMA/streams, complete IRPs, don’t leak mappings.
- App must survive driver stop: `routing_stop` semantics, clear errors in UI.
- Version IOCTL or interface GUID for forward compatibility.

## Phased delivery

| Phase | Transport |
|-------|-----------|
| **11C** | None — endpoint visible, audio render-to-null inside driver |
| **11D** | Buffered IOCTL — PCM reaches user mode |
| **11E** | IOCTL into existing Routing Lab capture injection |
| **Post-11E** | Shared-memory ring + events; retire or keep IOCTL as fallback |

## Integration sketch (11E)

```text
┌─────────────────────┐
│  Windows apps       │
│  play to Audapp     │
│  Input (driver)     │
└──────────┬──────────┘
           │ PCM
           ▼
┌─────────────────────┐     ┌──────────────────────────┐
│  Audapp driver      │────►│  User mode (Tauri/Rust)   │
│  (ACX)              │ IOCTL│  Transport reader thread │
└─────────────────────┘     └──────────┬───────────────┘
                                       │ write F32Ring
                                       ▼
                            ┌──────────────────────────┐
                            │  Existing duplex/DSP/     │
                            │  render (unchanged)       │
                            └──────────────────────────┘
```

## Summary

| Stage | Transport |
|-------|-----------|
| POC / bridge | **Buffered IOCTL polling** |
| Production | **Shared-memory ring + event signaling** |
| Driver scope (initial) | **Replace capture source only** — not DSP in kernel |

See: [phase-11c-go-no-go.md](phase-11c-go-no-go.md), Phase 11A plan §5.
