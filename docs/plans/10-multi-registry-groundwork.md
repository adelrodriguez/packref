# Plan 10: Multi-Registry Groundwork

## Goal

Prepare the registry and manifest seams so non-npm registries (JSR, PyPI, crates.io) can be added
as self-contained adapters without changing command behavior, project layout, or the lockfile
schema.

## Status

Complete.

## Context

The v1 lockfile and store path model already include `registry`, so no layout migration is needed.
The remaining coupling points are:

- `SUPPORTED_REGISTRIES` in `src/lib/core/registry.ts` is `["npm"]`; it drives the `Registry`
  union, `checkIsRegistry`, and spec-prefix validation in `src/lib/core/packages.ts`.
- `registryAdapters` in `src/lib/registries/index.ts` is a `Record<Registry, RegistryAdapter>`,
  so widening the union forces each new adapter to be registered (good — keep this).
- `ResolvedPackageReference` in `src/lib/registries/registry.ts` requires `tarballUrl`. All
  planned registries serve a gzipped-tar archive (npm tarball, JSR npm-compat tarball, PyPI
  sdist, crates `.crate`), so the field stays required — but the name and extraction rules
  should not assume npm's `package/` root directory.
- `DEPENDENCY_GROUPS` in `src/lib/manifests/manifest.ts` hardcodes JavaScript group names, and
  `manifestAdapters` in `src/lib/manifests/index.ts` selects the first matching adapter only.
- npm version resolution (`resolveVersion` in `src/lib/registries/npm/resolver.ts`) is
  semver-only. That is correct for npm/JSR/crates; PyPI needs its own scheme (see Plan 13).

## Scope

- Make the tarball extractor tolerant of registry-specific archive roots: npm/JSR use
  `package/`, crates use `<name>-<version>/`, sdists use `<name>-<version>/`. Extraction should
  strip a single root directory regardless of its name (verify current `nanotar` handling and
  the "multiple roots" failure path in `src/lib/sources/tarball/fetch.ts`).
- Allow multiple detected manifest adapters per project (a repo can have both `package.json`
  and `pyproject.toml`). `readProjectDependencies` should merge dependencies from every
  detected adapter; bare `packref add` and `sync` operate over the merged set.
- Move JS-specific group names out of the shared manifest contract: `ManifestDependency.group`
  becomes an adapter-defined string.
- Keep `UnsupportedRegistryError` as the failure for unknown prefixes; update its message to
  list supported registries.
- Document the adapter checklist (registry union entry, adapter module, adapter map entry,
  optional manifest adapter) in `docs/architecture.md`.

## Implementation Steps

1. Audit `src/lib/sources/tarball/fetch.ts` root-directory handling; generalize root stripping
   and add tests with npm-style, crate-style, and sdist-style archive fixtures.
2. Change `ManifestDependency.group` to `string` and move `DEPENDENCY_GROUPS` into
   `src/lib/manifests/javascript.ts`.
3. Change `getManifestAdapter`/`readProjectDependencies` in `src/lib/manifests/index.ts` to
   collect all detected adapters and merge their dependencies; update `add` and `sync` call
   sites if their types change.
4. Update the `UnsupportedRegistryError` message to enumerate `SUPPORTED_REGISTRIES`.
5. Update `docs/architecture.md` module seams with the new-registry checklist.
6. Write/extend unit tests beside each touched module.

## Acceptance Criteria

- Adding a registry requires only: a `SUPPORTED_REGISTRIES` entry, an adapter module under
  `src/lib/registries/<registry>/`, a `registryAdapters` entry, and (for new ecosystems) a
  manifest adapter — no command or workspace changes.
- Tarball extraction succeeds for archives whose single root is not named `package`.
- Projects with multiple manifests get merged dependency lists.
- `bun run check` and `bun run test` pass.

## Validation

```sh
bun run format
bun run check
bun run test
```

## Out Of Scope

- Any actual new registry adapter (Plans 12–14).
- Lockfile or store layout changes.
- Non-semver version resolution (owned by Plan 13).
