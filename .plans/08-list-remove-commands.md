# Plan 08: List + Remove Commands

## Goal

Implement the project-local management commands that inspect and remove references.

## Scope

- Implement `packref list`.
- Implement `packref remove <pkg>`.
- Keep operations limited to project-local `.packref/` data and lockfile entries.
- Add tests for deterministic output and safe removal.

## Implementation Steps

1. Implement lockfile listing helpers if they were not already added.
2. Wire `packref list` to print referenced packages deterministically.
3. Implement package lookup for removal by package name.
4. Delete the project-local `.packref/<encoded package>@<version>/` directory.
5. Remove the package entry from `.packref/packref-lock.json`.
6. Return a clear error when the project is not initialized.
7. Return a clear error when the package is not referenced.
8. Add tests for empty lists, populated lists, successful removal, missing package removal, and uninitialized projects.

## Acceptance Criteria

- `packref list` prints one package reference per line.
- `packref list` output is sorted deterministically.
- `packref remove react` removes only the project-local reference.
- `packref remove react` updates the lockfile.
- `packref remove react` does not delete the global store entry.

## Validation

Run:

```sh
bun run format
bun run check
bun run typecheck
bun run test
```

## Out Of Scope

- Global store pruning.
- Adding package references.
- Rich terminal UI.
