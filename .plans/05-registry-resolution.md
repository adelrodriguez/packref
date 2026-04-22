# Plan 05: Registry Resolution

## Goal

Resolve user package input into concrete npm package metadata that later plans can use to fetch source snapshots.

## Scope

- Parse package requests with optional versions or ranges.
- Fetch npm registry metadata.
- Resolve a concrete version.
- Extract repository information from package metadata.
- Model registry-related failures with typed errors.
- Add mocked tests for registry behavior.

## Implementation Steps

1. Finalize package request parsing from Plan 03.
2. Implement metadata fetching from the npm registry.
3. Resolve `latest` when no version is provided.
4. Resolve exact versions.
5. Resolve semver ranges.
6. Extract repository URL metadata for the resolved version.
7. Return a normalized registry result containing package name, version, repository metadata, and raw metadata needed by repository resolution.
8. Add mocked tests for success, not found, missing version, invalid range, scoped packages, and missing repository metadata.

## Acceptance Criteria

- `react` resolves to a concrete version.
- `react@19.0.0` resolves exactly when that version exists.
- `react@^19.0.0` resolves to the highest satisfying version.
- Scoped package requests are parsed correctly.
- Missing packages produce `PackageNotFoundError`.
- Missing repository metadata produces `NoRepositoryError`.

## Validation

Run:

```sh
bun run format
bun run check
bun run typecheck
bun run test
```

## Out Of Scope

- Git URL normalization beyond preserving registry output.
- Git tag discovery.
- Cloning snapshots.
- Updating project lockfiles.
