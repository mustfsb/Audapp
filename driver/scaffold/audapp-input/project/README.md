# Project staging area

This directory is the isolated staging area for imported upstream sample files and any minimal Audapp-specific adaptation notes.

## Rules

- Keep imported upstream files in `upstream-audiocodec/`.
- Do not hand-copy large sample trees without updating `PROVENANCE.md`.
- Do not point Cargo, npm, or Tauri at this directory.
- Stop and document blockers instead of inflating this tree with unrelated sample code.
