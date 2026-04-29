# Plan 02: Add Command

## Goal

Deliver `packref add <pkg[@version]>` as a complete end-to-end workflow: resolve a package from npm, fetch its source snapshot with `giget`, store it globally, reflink it into the project, and update the lockfile.

## Scope

- Parse package input with optional registry prefix and optional version or range (`react`, `npm:react`, `react@19.0.0`, `react@^19.0.0`, `@effect/cli`).
- Default omitted registry prefixes to `npm`; reject unsupported registry prefixes in v1 with a clear error.
- Fetch npm registry metadata and resolve a concrete version.
- Extract repository URL and optional `repository.directory` from package metadata.
- Normalize repository URLs into `giget`-compatible source strings.
- Discover remote git tags and match resolved version to a tag.
- Fetch source snapshot into the global store with `giget`.
- Implement store existence checks (skip fetch if already stored).
- Reflink (with copy fallback) the full store entry into `.packref/`.
- For monorepo packages with npm `repository.directory`, expose the project-local reference at the package subdirectory inside the full repository snapshot.
- Update `.packref/packref-lock.json` with an array entry containing `registry`, `name`, `version`, `tracking: "manual"`, and nested repository `source` metadata.
- Auto-initialize the project if `.packref/` does not exist.
- Allow multiple versions of the same package to coexist in the same project.
- Implement typed errors for the full pipeline in `lib/core/errors.ts` (`UnsupportedRegistryError`, `PackageNotFoundError`, `NoRepositoryError`, `TagNotFoundError`, `SnapshotFetchError`, `ReflinkError`, `NetworkError`).
- Implement npm metadata schema needed by registry resolution in `lib/registries/npm/metadata.ts`.
- Add tests for the add flow.

## Phase Strategy

Implement `packref add` in small phases. Each phase should leave the codebase valid and tested, even when the full end-to-end add command is not complete until the final phase.

Use the updated architecture from `implementation-strategy.md`:

- Commands stay thin and call command-aligned reference modules such as `lib/references/add.ts`.
- Registry adapters use `defineRegistry`; registry lookup lives in `lib/registries/index.ts`.
- Tests live beside the code they cover in colocated `__tests__/` directories.
- Manifest adapters are not part of this plan; they belong to sync.

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

### Phase 4: Store + Project Reference Materialization

Goal: Fetch source snapshots, maintain the global store, create project-local references, and update lockfiles.

Deliverables:

- Install `giget` as a runtime dependency.
- Add `lib/sources/repository/fetch.ts` for fetching repository snapshots into the global store.
- Add `lib/store/store.ts` for store existence checks, entry paths, listing, and removal.
- Add `lib/services/reflinker.ts` for recursive reflink with copy fallback.
- Extend `lib/workspace/project.ts` to create project-local package references.
- Support npm `repository.directory` by exposing that subdirectory locally while retaining the full repository snapshot globally.
- Extend `lib/workspace/lockfile.ts` with idempotent package-entry upsert by `registry + name + version`.

Tests:

- existing store entries are reused.
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

### Phase 5: Add Orchestration + CLI

Goal: Wire the end-to-end `packref add` behavior through the command-aligned reference module.

Deliverables:

- Add `lib/references/add.ts` as the add orchestration boundary.
- Auto-initialize the project when `.packref/` is missing.
- Run parse -> registry resolve -> repository tag resolve -> store fetch/reuse -> project reference -> lockfile update.
- Update the lockfile only after project reference creation succeeds.
- Keep `commands/add.ts` thin: parse the CLI argument, call `lib/references/add.ts`, and report through `Prompter`.
- Update `index.ts` layers to provide the new Packref services.

Tests:

- adding in an uninitialized project creates `.packref/`, initializes the lockfile, and registers the project.
- re-adding the same `registry + name + version` does not duplicate lockfile entries.
- adding the same package at a different version creates a second reference.
- already-stored snapshots are reused without refetching.
- failure before project reference creation does not mutate the lockfile.
- failure after snapshot fetch may leave the global store entry but does not update the lockfile.
- one integration-style test adds a small real npm package with repository metadata.

Validation checkpoint:

```sh
bun run format
bun run check
bun run test
```

## Acceptance Criteria

- `packref add react` resolves the latest version, fetches the snapshot with `giget`, creates `.packref/packages/npm/react/<version>/`, and updates the lockfile.
- `packref add npm:react` is accepted and treated as an explicit npm package spec.
- `packref add react@19.0.0` resolves that exact version.
- `packref add react@^19.0.0` resolves the highest satisfying version.
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
- Missing repository metadata produces `NoRepositoryError`.
- Missing git tags produce `TagNotFoundError`.
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
