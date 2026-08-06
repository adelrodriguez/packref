# Plan 13: crates.io Registry Adapter

## Goal

Support `packref add crates:<name>[@version]` so Rust crates get versioned source references,
preferring repository snapshots with the published `.crate` archive as fallback, and add a Rust
manifest adapter so versionless `add` and `sync` work in Rust projects.

## Status

Not started. Depends on Plan 10.

## Scope

- Accept the `crates:` registry prefix.
- Resolve versions with semver, honoring Cargo's caret-by-default interpretation of bare
  version requirements (`serde = "1.0"` means `^1.0`).
- Discover repository URLs from crate metadata (`repository` field) for the repository-first
  flow.
- Fall back to the `.crate` download (a gzipped tar with a `<name>-<version>/` root — covered
  by Plan 10's root-stripping work) under existing fallback rules.
- Respect crates.io API requirements: send a descriptive `User-Agent` header per its crawler
  policy; consider the sparse index (`index.crates.io`) if the API shape makes it simpler.
- New manifest adapter `src/lib/manifests/rust.ts`: detect `Cargo.toml`, read `[dependencies]`,
  `[dev-dependencies]`, and `[build-dependencies]`, resolve exact versions from `Cargo.lock`
  with registry fallback.

## Implementation Steps

1. Verify crates.io endpoints during implementation: crate metadata
   (`/api/v1/crates/<name>`), version download URL
   (`/api/v1/crates/<name>/<version>/download`), and User-Agent policy.
2. Add `"crates"` to `SUPPORTED_REGISTRIES`; confirm spec parsing for `crates:serde@1.0.219`.
3. Implement `src/lib/registries/crates/` (`client.ts`, `metadata.ts`, `resolver.ts`) with
   `defineRegistry`; map Cargo requirement syntax onto semver resolution; return identity +
   repository candidate + `.crate` URL.
4. Register the adapter in `registryAdapters`.
5. Implement `src/lib/manifests/rust.ts` with `defineManifest` (TOML parsing shared with Plan
   12's choice; handle string and table dependency forms, skip `path`/`git` dependencies) and
   register it in `manifestAdapters`.
6. Unit tests with mocked HTTP; integration test against a small real crate.
7. Update README and the init-generated AGENTS.md section; add a minor changeset.

## Acceptance Criteria

- `packref add crates:serde` resolves the `Cargo.lock` version in a Rust project, or latest
  otherwise, and materializes a reference with `registry: "crates"`.
- `.crate` fallback extracts correctly despite the non-`package` archive root.
- Workspace/monorepo crates use `repository` + tag matching like npm monorepo packages;
  `package@version`-style tags (e.g. `serde-1.0.219`, `v1.0.219`) match through the existing
  tag heuristics, extended if needed.
- Rust projects get manifest multiselect in bare `packref add`, and `sync` reconciles
  dependency-tracked crate entries.
- `bun run check` and `bun run test` pass.

## Validation

```sh
bun run format
bun run check
bun run test
```

## Out Of Scope

- Alternate Cargo registries.
- `path`/`git` dependencies in `Cargo.toml`.
- Cargo workspace member enumeration beyond what tag matching needs.
