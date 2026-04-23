# Plan 03: List + Remove Commands

## Goal

Deliver `packref list` and `packref remove <pkg>` as complete user-facing commands for inspecting and managing project references.

## Scope

- Implement `packref list` to print all referenced packages from the lockfile.
- Implement `packref remove <pkg>` to delete a project-local reference and its lockfile entry.
- Support exact removal by `registry:name@version`.
- When a remove spec matches multiple versions, show a multiselect prompt for the versions to remove.
- Handle error cases: uninitialized project, package not referenced.
- Add tests for both commands.

## Implementation Steps

1. Implement or extend lockfile listing helpers if not already present from Plan 01.
2. Wire `packref list` in `commands/list.ts`: read lockfile, print one `registry:name@version source.type source.host tracking` entry per line, sorted deterministically by registry, name, version.
3. Implement package lookup by full identity (`registry + name + version`) for exact removal.
4. Implement package lookup by `registry + name` for ambiguous removal; if multiple versions match, ask with a multiselect prompt.
5. Delete selected project-local `.packref/packages/<registry>/<package>/<version>/` or `.packref/packages/<registry>/<scope>/<package>/<version>/` directories.
6. Remove selected package entries from `.packref/packref-lock.json`.
7. Wire `packref remove` in `commands/remove.ts`.
8. Return `NotInitializedError` when the project has no `.packref/`.
9. Return a clear error when the requested package is not referenced.
10. Add tests: empty list message, populated list with multiple versions, successful exact removal, multiselect removal when multiple versions match, removing a non-existent package, running against an uninitialized project.

## Acceptance Criteria

- `packref list` prints one `registry:name@version source.type source.host tracking` entry per line.
- `packref list` output is sorted deterministically.
- `packref list` in an empty project prints a helpful message that no packages are currently installed.
- `packref remove npm:react@18.3.1` removes only that project-local reference directory.
- `packref remove npm:react@18.3.1` removes only that lockfile entry.
- `packref remove react` defaults to npm and removes directly when only one version matches.
- `packref remove react` shows a multiselect prompt when multiple versions match.
- `packref remove react` does **not** delete the global store entry.
- Removing a package that is not referenced produces a clear error.
- Running either command without `packref init` produces `NotInitializedError`.

## Validation

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
