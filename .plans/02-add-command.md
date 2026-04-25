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
- Implement npm metadata schema needed by registry resolution in `lib/core/schemas.ts`.
- Add tests for the add flow.

## Implementation Steps

1. Install `semver` and `giget` as additional required runtime dependencies.
2. Implement `lib/services/registry-client.ts`: fetch npm metadata through Effect and model fetch failures.
3. Implement package spec parsing with npm as the default registry and clear unsupported-registry errors.
4. Implement `lib/packages/registry.ts`: define a shared registry resolver contract, implement npm resolution, resolve `latest`/exact/range versions, and extract repository URL plus optional `repository.directory`.
5. Implement `lib/packages/repository.ts`: normalize repo URL into a `giget` source, run `git ls-remote --tags` through `CommandRunner`, match version to tag (`v{version}`, `{version}`, `{pkg}@{version}`).
6. Implement `lib/packages/snapshot.ts`: fetch the matched tag/ref with `giget` into the global store.
7. Implement `lib/packages/store.ts`: check existence, get nested identity path, list entries, remove entry.
8. Implement `lib/services/reflinker.ts`: recursive reflink with copy fallback.
9. Extend `lib/workspace/project.ts`: create project reference path under `.packref/packages/<registry>/<package>/<version>/` for unscoped packages and `.packref/packages/<registry>/<scope>/<package>/<version>/` for scoped packages; when `repository.directory` is present, point the project reference at that subdirectory inside the stored full repo snapshot.
10. Extend `lib/workspace/lockfile.ts`: add array package entry including `registry`, `name`, `version`, `tracking`, and nested repository `source` metadata (`type`, `host`, `url`, optional `directory`).
11. Extend `lib/core/schemas.ts`: npm metadata schemas with `effect/Schema`.
12. Extend `lib/core/errors.ts`: `UnsupportedRegistryError`, `PackageNotFoundError`, `NoRepositoryError`, `TagNotFoundError`, `SnapshotFetchError`, `ReflinkError`, `NetworkError`, `StoreCorruptedError`.
13. Wire `packref add` in `commands/add.ts`: auto-init project if needed, then run parse -> resolve -> fetch snapshot -> store -> reflink -> lockfile.
14. Ensure adding the same `registry + name + version` is idempotent.
15. Ensure adding the same package at a different version creates an additional project-local reference and lockfile entry.
16. Add mocked tests for registry resolution (success, not found, missing version, scoped packages, missing repo).
17. Add mocked tests for repository resolution and snapshot fetching (tag matching, `giget` fetch, store reuse).
18. Add tests for unsupported registry prefixes, auto-init, and same-package multi-version behavior.
19. Add one integration test using a small real package.

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
