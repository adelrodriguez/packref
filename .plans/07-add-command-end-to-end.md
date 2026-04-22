# Plan 07: Add Command End-to-End

## Goal

Implement `packref add <pkg[@version]>` as the first complete user-facing package reference workflow.

## Scope

- Require or bootstrap project initialization behavior for add.
- Resolve package input through the registry layer.
- Resolve repository tags and global snapshots.
- Copy or reflink global store entries into `.packref/`.
- Update `.packref/packref-lock.json`.
- Add end-to-end tests for the add flow.

## Implementation Steps

1. Decide whether `add` should require `packref init` first or auto-initialize the project.
2. Implement project reference path creation under `.packref/`.
3. Implement recursive reflink with copy fallback.
4. Wire registry resolution, repository resolution, snapshot store, project reference creation, and lockfile update.
5. Ensure adding the same package twice is idempotent.
6. Ensure adding a newer version replaces or coexists according to the lockfile design.
7. Add tests with mocked registry and git behavior.
8. Add one integration test using a tiny real package or a local fixture repository.

## Acceptance Criteria

- `packref add react` updates `.packref/packref-lock.json`.
- `packref add react` creates `.packref/react@<version>/`.
- `packref add @scope/pkg` uses encoded folder names.
- Re-adding an existing reference does not duplicate lockfile entries.
- Failure midway does not leave a corrupted lockfile.
- Tests cover success and key failure paths.

## Validation

Run:

```sh
bun run format
bun run check
bun run typecheck
bun run test
```

## Out Of Scope

- Pruning unused global store entries.
- Rich CLI output formatting.
- Tarball fallback.
- Monorepo package extraction.
