# Audapp - Phase 12C Driver Package Cleanup Build Prompt

## Target Thread
Audapp - Phase 12C Driver Package Cleanup Build

## Target Agent
Codex

## Suggested Model / Effort
GPT-5.4 - High effort  
Alternative: GPT-5.5 - High/XHigh effort

## Mode
Build mode

## Suggested Skills
- `superpowers:systematic-debugging`
- `superpowers:verification-before-completion`
- `superpowers:subagent-driven-development`
- Driver packaging and WDK build verification skills

## Project Path
```text
C:\Users\musta\Audapp
```

## Scope

This phase exists to clean up the driver package identity and staging layout only. The goal is to make the package-facing naming, scaffold layout, and staged output deterministic and Audapp-specific while preserving compile-only success.

In scope:

- package-facing naming and metadata,
- deterministic staging layout,
- build/package scripts and paths needed to emit the staged package,
- verification that the staged package contains the intended non-installed artifacts.

Out of scope:

- driver installation or loading,
- test signing or boot-configuration changes,
- certificate creation or binary signing,
- root-enumeration behavior,
- runtime endpoint validation,
- routing or product-behavior work.

## Hard Safety Boundaries

Do not do any of the following:

- do not install any driver,
- do not load any driver,
- do not enable test signing,
- do not run `bcdedit`,
- do not run `pnputil`,
- do not run `devcon`,
- do not create certificates,
- do not sign binaries,
- do not change boot configuration,
- do not push to remote,
- do not make destructive Git changes.

## Main Objective

Clean up the package identity and staging layout so the driver scaffold presents as `Audapp Input` instead of generic `AudioCodec`, with deterministic package output under:

```text
driver\scaffold\audapp-input\package\Debug\x64
```

Keep the work compile-only and package-only. Ensure the staged package contains at least the INF and SYS artifacts, but stop before CAT signing, installation, driver loading, routing work, or any install-path/root-enumeration behavior.

## Concrete Tasks

### Task 1 - Inspect current package identity and staging references

Review the driver scaffold for all package-facing `AudioCodec` names, labels, metadata strings, folder names, output paths, and script references that affect the package artifact layout.

Focus on:

- INF metadata and display strings,
- package folder naming,
- build script output paths,
- staged artifact names,
- any README or helper-script references that surface package identity.

Confirm which references are safe to rename now and which behavior must remain untouched.

### Task 2 - Rename package-facing identity toward Audapp Input

Update package-facing naming from generic `AudioCodec` toward `Audapp Input` wherever it affects the staged package identity and does not require install/load behavior.

Prefer changes that keep compile-only behavior intact, such as:

- package name and display strings,
- installer-facing labels that are part of the package metadata,
- scaffold naming that maps to the package output,
- any deterministic directory labels used for staging.

Do not introduce install, load, signing, or boot changes as part of the rename.

### Task 3 - Make the staging directory deterministic

Ensure the build/scaffold flow stages package outputs into:

```text
driver\scaffold\audapp-input\package\Debug\x64
```

The staging path should be deterministic and reproducible across runs. If a script currently emits a different Debug/x64 path or uses a generic package folder name, normalize it so the Audapp package lands in the target location above.

### Task 4 - Verify the staged package contents

After the cleanup, verify that the staged package contains at least:

- the INF file,
- the SYS file.

If additional non-install artifacts appear, leave them alone unless they are part of the package identity cleanup. Do not attempt CAT signing or installation.

### Task 5 - Preserve compile-only success and stop before install/load

Re-run only the build/package steps needed to prove the cleanup works.

Confirm:

- the compile-only build still succeeds,
- package staging resolves to the target directory,
- staged artifacts are present,
- no install/load/signing/root-enumeration steps are executed.

If any step drifts toward installation, driver loading, or boot changes, stop and fix the package cleanup scope instead.

## Acceptance Criteria

The phase is complete when all of the following are true:

- package-facing naming and metadata that define the staged package identity have been updated from generic `AudioCodec` to `Audapp Input` wherever this phase explicitly allows,
- the staging layout resolves deterministically under `driver\scaffold\audapp-input\package\Debug\x64`,
- the staged package exists at that exact path and contains the intended INF and SYS artifacts,
- compile-only success is preserved,
- no driver install or load actions were performed,
- no test-signing, `bcdedit`, `pnputil`, `devcon`, certificate creation, signing, or boot configuration changes were performed,
- no remote push or destructive Git operation was performed.

## Final Response Format

When finished, report:

1. whether package-facing identity was updated toward `Audapp Input`,
2. whether the staging directory is deterministic at `driver\scaffold\audapp-input\package\Debug\x64`,
3. whether the staged package contains at least INF and SYS,
4. whether compile-only success was preserved,
5. the exact staged output path that was verified,
6. the exact build command or verification step used to confirm compile-only success,
7. whether any install/load/signing/root-enumeration step was attempted,
8. the first blocker if the cleanup could not be completed,
9. the exact next step, if any.

Keep the response short, direct, and implementation-focused.

## Very Short Summary

Clean up the driver package identity and staging layout for `Audapp Input` while staying strictly compile-only and stopping before install, load, signing, or boot changes.
