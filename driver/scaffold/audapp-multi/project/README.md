# Project staging area

This directory is the isolated staging area for imported upstream sample files and minimal Audapp-specific compile-only adaptations.

## Rules

- Keep imported upstream driver files in `upstream-audiocodec/`.
- Keep build outputs untracked.
- Do not point Cargo, npm, or Tauri at this directory.
- Do not add install, load, or signing automation here.
