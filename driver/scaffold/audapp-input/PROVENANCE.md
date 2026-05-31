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

- No upstream Microsoft driver source has been vendored into this repo by default.
- `prepare.ps1` is the approved import path when a local official checkout is available.
- Any future imported files must be documented here with the exact upstream path and date.

## License note

Upstream Microsoft sample files remain governed by their original repository licensing terms. Keep imported files traceable and minimal.
