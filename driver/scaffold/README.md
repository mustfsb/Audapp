# Driver scaffold

This directory holds isolated driver-side scaffolding only. Nothing here is wired into the root Audapp application build.

## Contents

- `audapp-input/` - compile-only scaffold for the future `Audapp Input` virtual render endpoint

## Build isolation

- Do not add this tree to Cargo, npm, or Tauri workflows.
- Do not treat these files as a shipping driver package.
- Run all driver preparation and build steps only through explicit scripts under the scaffold.

## Phase 11C expectation

The first milestone remains compile-only:

- target one endpoint named `Audapp Input`
- prefer ACX project structure
- use SYSVAD only as a reference pattern
- no install, no load, no test-signing, no admin-only system changes
