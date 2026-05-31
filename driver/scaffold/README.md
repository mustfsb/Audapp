# Driver scaffold (placeholder)

**Phase 11B:** This directory is intentionally empty of buildable driver code.

Future phases (11C onward) may add:

- WDF/ACX driver project files (`.vcxproj`, INF, sources)
- Isolated build scripts that do **not** invoke from the root `cargo` / `npm` workflows
- Sample-derived structure referenced from SYSVAD virtual-audio patterns

## Build isolation

- Do **not** add this tree as a Cargo workspace member.
- Do **not** reference `driver/` from `src-tauri` or Tauri bundle config.
- Driver builds should run only from explicit, documented commands on a WDK-equipped machine (Phase 11C+).

## Phase 11C expectation

First compile-only milestone: minimal **Audapp Input** virtual render endpoint that appears in Windows sound settings and accepts audio (initially render-to-null inside the driver). Install and test-signing remain **opt-in** and VM-only unless explicitly approved.
