# Phase 11D - Transport Preview

Phase 11D is intentionally deferred until Phase 11C produces a credible compile-only driver scaffold.

## Phase 11D goal

Carry PCM written to `Audapp Input` from the driver into Audapp user mode without changing the existing DSP and render architecture.

## Planned boundary

- Driver side remains responsible only for endpoint exposure and PCM production.
- User mode remains responsible for ring buffering, DSP/EQ, metering, and physical render output.
- The first transport iteration stays with buffered IOCTL polling.

## Not in Phase 11D

- shared-memory production transport
- multi-endpoint buses
- kernel DSP
- installer and signing automation
- automatic Routing Lab UI integration

## Preconditions from Phase 11C

- one isolated driver scaffold exists
- compile-only build path is documented and repeatable
- endpoint naming is frozen as `Audapp Input`
- no Cargo/Tauri coupling was introduced

## Buffered IOCTL preview

Likely initial calls:

- `GET_FORMAT`
- `GET_STATUS`
- `READ_AUDIO_BUFFER`

This keeps the first bridge close to Audapp's existing poll-based duplex worker model and avoids taking on shared-memory lifecycle risk too early.
