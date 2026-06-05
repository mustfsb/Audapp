# Provenance

## Official upstream sources

- Repository: `microsoft/Windows-driver-samples`
- ACX sample basis: `audio/Acx/Samples/AudioCodec/Driver`
- SYSVAD reference basis: `audio/sysvad`

## Why these sources

- ACX is the target framework direction for new audio driver work.
- The AudioCodec sample is the smallest clearly buildable ACX audio sample tree currently exposed in the official repository.
- SYSVAD remains the clearest reference for virtual-audio endpoint shape and packaging expectations.

## Intended imported files

ACX base files:

- `AudioCodec.sln`
- `AudioCodec.vcxproj`
- `AudioCodec.vcxproj.Filters`
- `AudioCodec.inf`
- `Driver.cpp`
- `Device.cpp`
- `DriverSettings.h`
- `Resources.rc`
- `ReadMe.txt`

SYSVAD reference files to inspect before deeper adaptation:

- `sysvad.sln`
- `adapter.cpp`
- `common.cpp`
- `common.h`
- `README.md`
- `EndpointsCommon/`
- `Package/`

## Current state

- Minimal compile-only scaffold sources are now intentionally vendored from the official sample set:
  - `project/upstream-audiocodec/` from `audio/Acx/Samples/AudioCodec/Driver`
  - `Common/` from `audio/Acx/Samples/Common`
  - `inc/AudioFormats.h` and `inc/cpp_utils.h` from `audio/Acx/Samples/Inc`
  - `shared/Public.h` and `shared/Trace.h` from `audio/Acx/Samples/Shared`
- `prepare.ps1` remains the approved path to refresh the isolated upstream sample snapshot.
- Build outputs under `Common/x64/` and `project/upstream-audiocodec/x64/` are not source and must stay untracked.

## License note

Upstream Microsoft sample files remain governed by their original repository licensing terms. Keep imported files traceable and minimal.
