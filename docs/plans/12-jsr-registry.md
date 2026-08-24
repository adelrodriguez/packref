# Plan 12: JSR Registry Adapter

## Goal

Support `packref add jsr:@scope/name[@version]` so JSR packages get versioned source references,
preferring repository snapshots with the JSR npm-compat tarball as fallback.

## Status

Not started. Depends on Plan 10.

## Scope

- Accept the `jsr:` registry prefix; all JSR packages are scoped (`@scope/name`).
- Resolve versions with semver against JSR metadata.
- Discover repository metadata for the repository-first source flow.
- Fall back to the npm-compat tarball served through `npm.jsr.io` under the existing fallback
  rules (metadata gaps only; network/auth failures fail loudly).
- Store entries under `packages/jsr/<scope>/<package>/<version>` (existing path model).
- Detect JSR dependencies in JavaScript manifests: `jsr:` specifiers in `package.json`
  dependency groups and, if cheap, `deno.json`/`deno.jsonc` imports.

## Implementation Steps

1. Verify JSR API endpoints during implementation (do not trust this plan's memory of them):
   package metadata and version listing (`jsr.io` / `api.jsr.io`), repository/GitHub linkage,
   and the npm-compat tarball URL shape on `npm.jsr.io`.
2. Add `"jsr"` to `SUPPORTED_REGISTRIES` in `src/lib/core/registry.ts`; confirm
   `parsePackageSpec` handles `jsr:@scope/name@version` (colon-before-slash prefix detection
   with a scoped name).
3. Implement `src/lib/registries/jsr/` (`client.ts`, `metadata.ts`, `resolver.ts`) with
   `defineRegistry`, mirroring the npm adapter: schemas for JSR metadata, semver resolution,
   `ResolvedPackageReference` with repository candidate + tarball URL.
4. Register the adapter in `registryAdapters` in `src/lib/registries/index.ts`.
5. Extend the JavaScript manifest adapter to report `jsr:`-specified dependencies with
   `registry: "jsr"` so versionless `add` and `sync` resolve them.
6. Unit tests with mocked HTTP for client/resolver; one integration test in
   `src/lib/references/__tests__/` against a small real JSR package.
7. Update README and the init-generated AGENTS.md section with a JSR example.
8. Add a minor changeset.

## Acceptance Criteria

- `packref add jsr:@std/assert` resolves, fetches, and materializes a reference with correct
  lockfile `registry: "jsr"` and source metadata.
- Repository-first with tarball fallback behaves per the existing fallback rules.
- `packref list`, `remove`, `install`, `sync`, `prune`, and `clean` handle JSR entries without
  special-casing.
- `pnpm run check` and `pnpm run test` pass.

## Validation

```sh
pnpm run format
pnpm run check
pnpm run test
```

## Out Of Scope

- A Deno-native manifest adapter beyond cheap `deno.json` import detection.
- PyPI and crates adapters (Plans 13–14).
