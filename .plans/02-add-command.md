# Plan 02: Add Command

## Goal

Deliver `packref add <pkg[@version]>` as a complete end-to-end workflow: resolve a package to the version the project actually uses, fetch its source snapshot with `giget` (falling back to the npm tarball when no repository source is fetchable), store it globally, reflink it into the project, and update the lockfile.

## Status

Phases 1–3 are implemented. Remaining: Phase 3 amendments, Phases 4–7.

## Scope

- Parse package input with optional registry prefix and optional version or range (`react`, `npm:react`, `react@19.0.0`, `react@^19.0.0`, `@effect/cli`).
- Default omitted registry prefixes to `npm`; reject unsupported registry prefixes in v1 with a clear error.
- Resolve versionless specs against the project manifest first: package-manager lockfile via `nypm` → `node_modules/<pkg>/package.json` → registry `latest`.
- Fetch npm registry metadata and resolve a concrete version.
- Extract repository URL and optional `repository.directory` from package metadata.
- Normalize repository URLs into `giget`-compatible source strings (github/gitlab/bitbucket/sourcehut).
- Discover remote git tags and match resolved version to a tag.
- Fetch source snapshot into the global store with `giget`, atomically (temp dir + rename).
- Fall back to the npm tarball (`dist.tarball` + `nanotar` extraction) when the package has no repository field, the host is unsupported, or no tag matches. Never fall back on network/auth failures.
- Implement store existence checks (skip fetch if already stored).
- Reflink (with copy fallback) the full store entry into `.packref/`.
- For monorepo packages with npm `repository.directory`, expose the project-local reference at the package subdirectory inside the full repository snapshot.
- Update `.packref/packref-lock.json` with an array entry containing `registry`, `name`, `version`, `tracking`, and nested `source` metadata (`repository` or `tarball`).
- Tracking assignment: versionless spec resolved from the manifest → `"dependency"`; explicit version/range or non-manifest package → `"manual"`.
- Auto-initialize the project if `.packref/` does not exist.
- Allow multiple versions of the same package to coexist in the same project.
- Implement typed errors for the full pipeline in `lib/core/errors.ts` (`UnsupportedRegistryError`, `PackageNotFoundError`, `NoRepositoryError`, `TagNotFoundError`, `SnapshotFetchError`, `TarballFetchError`, `ReflinkError`, `NetworkError`).
- Implement npm metadata schema needed by registry resolution in `lib/registries/npm/metadata.ts`, including `dist.tarball`.
- Add tests for the add flow.

## Phase Strategy

Implement `packref add` in small phases. Each phase should leave the codebase valid and tested, even when the full end-to-end add command is not complete until the final phase.

Use the updated architecture from `implementation-strategy.md`:

- Commands stay thin and call command-aligned reference modules such as `lib/references/add.ts`.
- Registry adapters use `defineRegistry`; registry lookup lives in `lib/registries/index.ts`.
- Tests live beside the code they cover in colocated `__tests__/` directories.
- The minimal JavaScript manifest adapter is part of this plan (Phase 4) because versionless `add` must resolve the project's installed version. Plan 05 (sync) reuses it.

## Implementation Phases

### Phase 1: Core Types + Spec Parsing

Goal: Establish the shared package and source model used by the rest of the add pipeline.

Deliverables:

- Add `lib/core/packages.ts` for normalized package identity types, validation helpers, and package spec parsing with npm as the default registry.
- Add `lib/core/source.ts` for shared source candidate and lockfile source metadata types.
- Extend `lib/core/errors.ts` with add-flow tagged errors.
- Keep `lib/store/paths.ts` focused on constructing paths from normalized package identities.

Tests:

- npm defaulting: `react`, `react@19.0.0`, `react@^19.0.0`.
- explicit npm registry: `npm:react`, `npm:@effect/cli@0.29.0`.
- scoped packages: `@effect/cli`.
- unsupported prefixes fail clearly.
- package identity validation rejects invalid path segments.

Validation checkpoint:

```sh
bun run format
bun run check
bun run test
```

### Phase 2: npm Registry Adapter

Goal: Resolve an npm package spec into an exact package identity plus repository source candidate without touching the filesystem.

Deliverables:

- Install `semver` as a runtime dependency.
- Add `lib/registries/registry.ts` with `defineRegistry` and the shared registry adapter contract.
- Add `lib/registries/index.ts` with the v1 adapter map and lookup behavior.
- Add `lib/registries/npm/metadata.ts` with npm metadata schemas, including `repository.directory`.
- Add `lib/registries/npm/client.ts` using the Effect platform HTTP client.
- Add `lib/registries/npm/resolver.ts` for `latest`, exact version, and range resolution.
- Return `UnsupportedRegistryError` for non-npm registry prefixes in v1.

Tests:

- registry lookup selects npm and rejects unsupported registries.
- npm metadata decoding handles supported repository shapes.
- latest, exact, and range specs resolve to concrete versions.
- missing package produces `PackageNotFoundError`.
- missing version metadata produces a clear tagged error.
- missing repository metadata produces `NoRepositoryError`.

Validation checkpoint:

```sh
bun run format
bun run check
bun run test
bun run analyze
```

### Phase 3: Repository Source Resolution

Goal: Convert repository metadata into a concrete repository ref that can be fetched.

Deliverables:

- Add `lib/services/command-runner.ts` for running `git ls-remote --tags` through Effect process APIs.
- Add `lib/sources/repository/normalize.ts` for repository URL normalization into a `giget`-compatible source.
- Add `lib/sources/repository/tags.ts` for remote tag discovery and tag matching.
- Match candidate tags in this order: `v{version}`, `{version}`, `{pkg}@{version}`.

Tests:

- repository URL normalization covers common npm repository URL formats.
- remote tag parsing handles `git ls-remote --tags` output.
- tag matching honors the documented priority order.
- missing matching tags produce `TagNotFoundError`.

Validation checkpoint:

```sh
bun run format
bun run check
bun run test
```

### Phase 3 Amendments (small, before Phase 5)

Goal: Align the already-implemented normalization with the supported-host and fallback decisions.

Deliverables:

- Add sourcehut to the known-provider maps in `lib/sources/repository/normalize.ts`.
- Unknown hosts must no longer produce a raw `https://` `fetchSource` (giget cannot fetch it). Instead, normalization succeeds with host/url metadata but marks the source as not fetchable (e.g. `fetchSource: undefined` or a discriminant), which the add pipeline treats as a tarball-fallback trigger.
- Map a missing `git` binary to a clear, actionable error in tag discovery.

Tests:

- sourcehut URLs normalize to a giget-compatible fetch source.
- unknown-host repositories are marked not fetchable instead of getting a raw URL.

### Phase 4: Manifest Version Resolution

Goal: Resolve versionless specs to the version the project actually uses. This pulls the minimal JavaScript manifest adapter forward from the sync plan because `add`'s core guarantee depends on it.

Deliverables:

- Install `nypm` as a runtime dependency.
- Add `lib/manifests/manifest.ts` with `defineManifest` and the shared manifest adapter contract.
- Add `lib/manifests/index.ts` with adapter registration and project manifest detection.
- Add `lib/manifests/javascript.ts`: detect `package.json`, read `dependencies`/`devDependencies`/`peerDependencies`, and resolve exact installed versions via `nypm` package-manager lockfile first, `node_modules/<pkg>/package.json` second.
- Registry range resolution stays in the existing npm resolver; the manifest adapter only reports what the project has.

Tests:

- manifest detection finds `package.json` and reports its dependency groups.
- `nypm` lockfile resolution is preferred over `node_modules`.
- `node_modules` fallback works when no package-manager lockfile resolves the package.
- packages absent from the manifest report no version (caller falls through to registry `latest`).

Validation checkpoint:

```sh
bun run format
bun run check
bun run test
bun run analyze
```

### Phase 5: Store + Project Reference Materialization

Goal: Fetch repository snapshots atomically, maintain the global store, create project-local references, and update lockfiles.

Deliverables:

- Install `giget` as a runtime dependency.
- Add a store-root path constant (`~/.agents/packref/store/`) to `lib/workspace/paths.ts`.
- Add `lib/sources/repository/fetch.ts`: fetch with `giget` into a temporary directory, then rename into the global store path on success. No partial store entries.
- Add `lib/store/store.ts` for store existence checks, entry paths, listing, and removal.
- Add `lib/services/reflinker.ts` for recursive reflink with copy fallback.
- Extend `lib/workspace/project.ts` to create project-local package references.
- Support npm `repository.directory` by exposing that subdirectory locally while retaining the full repository snapshot globally.
- Extend `lib/workspace/lockfile.ts` with idempotent package-entry upsert by `registry + name + version`.

Tests:

- existing store entries are reused.
- a failed fetch leaves no store entry (temp dir cleaned up).
- scoped and unscoped project reference paths are correct.
- lockfile upsert is idempotent for the same package identity.
- multiple versions of the same package can coexist.
- `repository.directory` exposes the package subdirectory locally.
- snapshot fetch or reflink failures surface tagged errors.

Validation checkpoint:

```sh
bun run format
bun run check
bun run test
bun run analyze
```

### Phase 6: Tarball Fallback Source

Goal: Make `add` succeed for packages without fetchable repository sources.

Deliverables:

- Install `nanotar` as a runtime dependency.
- Extend `lib/registries/npm/metadata.ts` with `dist.tarball` and thread the tarball URL through the resolved package reference.
- Add `lib/sources/tarball/fetch.ts`: download the tarball with the platform HTTP client, extract with `nanotar` (stripping the `package/` prefix), write atomically into the same store path model.
- Add `TarballFetchError` to `lib/core/errors.ts`.
- Extend the lockfile `source` schema to `"repository" | "tarball"`; tarball entries record the tarball URL and never a `directory`.
- Encode the fallback rules where the pipeline chooses a source: `NoRepositoryError`, unsupported host, and `TagNotFoundError` trigger fallback; `NetworkError`, auth failures, and `SnapshotFetchError` do not.

Tests:

- missing repository metadata falls back to tarball.
- unsupported repository host falls back to tarball.
- no matching git tag falls back to tarball.
- network failure during tag discovery does not fall back.
- tarball extraction failure surfaces `TarballFetchError`.
- tarball lockfile entries record `source.type: "tarball"` and the URL.

Validation checkpoint:

```sh
bun run format
bun run check
bun run test
bun run analyze
```

### Phase 7: Add Orchestration + CLI

Goal: Wire the end-to-end `packref add` behavior through the command-aligned reference module.

Deliverables:

- Add `lib/references/add.ts` as the add orchestration boundary.
- Auto-initialize the project when `.packref/` is missing.
- Run parse -> manifest/registry version resolve -> repository tag resolve (or tarball fallback) -> store fetch/reuse -> project reference -> lockfile update.
- Assign tracking: `"dependency"` for versionless manifest packages, `"manual"` otherwise.
- Update the lockfile only after project reference creation succeeds.
- Keep `commands/add.ts` thin: parse the CLI argument, call `lib/references/add.ts`, and report through `Prompter`.
- Update `index.ts` layers to provide the new Packref services.

Tests:

- adding in an uninitialized project creates `.packref/`, initializes the lockfile, and registers the project.
- versionless add of a manifest dependency resolves the installed version and writes `tracking: "dependency"`.
- explicit-version add writes `tracking: "manual"` even for manifest dependencies.
- versionless add of a non-manifest package resolves registry `latest` and writes `tracking: "manual"`.
- re-adding the same `registry + name + version` does not duplicate lockfile entries.
- adding the same package at a different version creates a second reference.
- already-stored snapshots are reused without refetching.
- failure before project reference creation does not mutate the lockfile.
- failure after snapshot fetch may leave the global store entry but does not update the lockfile.
- one integration-style test adds a small real npm package with repository metadata.
- one integration-style test adds a package that requires the tarball fallback.

Validation checkpoint:

```sh
bun run format
bun run check
bun run test
```

## Acceptance Criteria

- `packref add react` in a project that depends on react resolves the exact installed version (lockfile via `nypm` → `node_modules` → registry) and writes `tracking: "dependency"`.
- `packref add react` in a project without react as a dependency resolves the registry `latest` version and writes `tracking: "manual"`.
- `packref add npm:react` is accepted and treated as an explicit npm package spec.
- `packref add react@19.0.0` resolves that exact version and writes `tracking: "manual"`.
- `packref add react@^19.0.0` resolves the highest satisfying version and writes `tracking: "manual"`.
- `packref add @effect/cli` creates `.packref/packages/npm/@effect/cli/<version>/`.
- Packages from monorepos store the full repository snapshot globally.
- Packages with npm `repository.directory` expose that package subdirectory as the project-local reference.
- Packages without npm `repository.directory` expose the repository root as the project-local reference.
- Packref does not attempt heuristic package-directory detection or extraction in v1.
- Re-adding the same `registry + name + version` does not duplicate lockfile entries.
- Adding an unreferenced package in an uninitialized project creates `.packref/`, writes an empty lockfile as needed, and registers the project.
- Adding a package already referenced at a different version creates an additional project-local reference and lockfile entry, and leaves existing versions intact.
- An already-stored snapshot is reused without re-fetching.
- Missing packages produce `PackageNotFoundError`.
- Successful repository snapshots record nested `source.type: "repository"` plus detected source host and repository URL.
- Missing repository metadata, an unsupported repository host, or no matching git tag falls back to the npm tarball and records `source.type: "tarball"` with the tarball URL.
- Network or authentication failures during repository resolution do not fall back to the tarball; they fail with an actionable error.
- A missing `git` binary produces a clear, actionable error.
- A failed or interrupted fetch leaves no partial global store entry.
- Failure midway does not leave a corrupted lockfile.
- If snapshot fetch succeeds but project reference creation or lockfile update fails, the fetched global store entry may remain for reuse; the project lockfile is updated only after the project reference succeeds.

## Validation

```sh
bun run format
bun run check
bun run typecheck
bun run test
```

## Out Of Scope

- Pruning unused global store entries.
- Rich CLI output formatting (spinners, colors).
- Heuristic monorepo package extraction.
- Sync adoption of manifest dependencies (Plan 05 reuses the manifest adapter and add pipeline built here).
