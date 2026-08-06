# Packref v2 Feature Candidates

## Goal

Track useful features that are intentionally out of scope for v1 so the v1 architecture can leave space for them without implementing them early.

## Additional Registries

Add non-npm registries such as JSR, PyPI, and crates.io.

### Proposed Behavior

- Keep npm as the default registry.
- Accept explicit registry prefixes such as `jsr:`, `pypi:`, and `crates:`.
- Store entries under `packages/registry/scope/package/version` or the registry-specific equivalent.
- Add registry-specific resolver modules behind the shared package identity and source candidate model.
- Add adapters under `lib/registries/<registry>/` that implement the shared `RegistryResolver` contract.
- Keep source materialization under `lib/sources/` so registry adapters do not fetch repositories or tarballs directly.

### Rationale

The v1 lockfile and path model already include `registry`, so additional registries should not require a project layout migration.
