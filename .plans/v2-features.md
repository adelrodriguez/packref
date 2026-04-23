# Packref v2 Feature Candidates

## Goal

Track useful features that are intentionally out of scope for v1 so the v1 architecture can leave space for them without implementing them early.

## Tarball Fallback

Add npm tarball fallback when repository source is unavailable.

### Proposed Behavior

1. Try repository source first:
   - registry metadata repository URL
   - matching git tag
   - `giget` fetch
2. If repository metadata is missing or no matching git tag exists, fetch the package tarball for the exact resolved version.
3. Store unpacked tarball contents in the global store under the same `packages/registry/scope/package/version` identity path model.
4. Record `source.type: "tarball"` in the lockfile entry.
5. Do not silently fall back for network failures, authentication failures, corrupted store entries, or unexpected repository snapshot errors.

### Rationale

Tarballs match published package contents and make Packref useful for packages without clean repository metadata or version tags. They may differ from source repositories, so the lockfile must make tarball-backed references explicit.

### Plan Impact

- Add `lib/sources/tarball/fetch.ts`.
- Add `TarballFetchError`.
- Extend lockfile schema from v1's `source.type: "repository"` to `"repository" | "tarball"`.
- Extend registry adapters so they may return ordered source candidates, e.g. repository first and tarball second for npm.
- Add tests for missing repository metadata, missing tag fallback, tarball extraction failure, and no fallback on transient repository fetch failures.

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

## Explicit Non-Goal: Arbitrary Repository References

Packref should remain focused on packages used by a project. Unlike OpenSrc, Packref does not plan to become a general repository cache for inputs such as `github:owner/repo@ref`.

Direct repository references can be reconsidered later only if they clearly support package-reference workflows. They should not be modeled as package registries because a repo ref is identified by provider/owner/repo/ref, not registry/name/version.
