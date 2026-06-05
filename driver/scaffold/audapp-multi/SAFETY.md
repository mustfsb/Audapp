# Safety

- Do not install this scaffold on a primary machine.
- Use a VM or disposable test machine for any future install work.
- Test-signing is deferred and out of scope for this phase.
- Uninstall and rollback procedures must be written before any install experiment.
- Kernel audio driver mistakes can BSOD or break system-wide audio.
- This scaffold is compile-only until Phase 11C clears its gates.

## This session guarantee

- no install
- no load
- no admin-only driver action
- no host audio stack modification
