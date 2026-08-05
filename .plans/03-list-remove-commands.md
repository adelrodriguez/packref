# Plan 03: List + Remove Commands

## Goal

Deliver `packref list` and `packref remove <pkg>` as complete user-facing commands for inspecting and managing project references.

## Status

Implemented.

## Scope

- Implement `packref list` to print all referenced packages from the lockfile.
- Implement `packref remove <pkg>` to delete a project-local reference and its lockfile entry.
- Support exact removal by `registry:name@version`.
- When a remove spec matches multiple versions, show a multiselect prompt for the versions to remove.
- Handle error cases: uninitialized project, package not referenced.
- Add tests for both commands.

## Implementation Steps

1. Add `NotInitializedError` to `lib/core/errors.ts` and a shared "require initialized project" helper (e.g. in `lib/workspace/project.ts`) so list/remove/sync/prune reuse the same check.
2. Implement or extend lockfile listing helpers if not already present from Plan 02.
3. Wire `packref list` in `commands/list.ts`: read lockfile, print one `registry:name@version source.type source.host tracking` entry per line, sorted deterministically by registry, name, version. Tarball-backed entries print `tarball` with no host.
4. Implement package lookup by full identity (`registry + name + version`) for exact removal.
5. Implement package lookup by `registry + name` for ambiguous removal; if multiple versions match, ask with a multiselect prompt.
6. Delete selected project-local `.packref/packages/<registry>/<package>/<version>/` or `.packref/packages/<registry>/<scope>/<package>/<version>/` directories. Directory deletion is best-effort: a lockfile entry whose directory is already missing is still removed, with a warning (drift tolerance).
7. Remove selected package entries from `.packref/packref-lock.json`.
8. Wire `packref remove` in `commands/remove.ts`.
9. Return `NotInitializedError` when the project has no `.packref/`.
10. Return a clear error when the requested package is not referenced.
11. Add tests: empty list message, populated list with multiple versions, tarball entry formatting, successful exact removal, multiselect removal when multiple versions match, removal when the reference directory is already missing, removing a non-existent package, running against an uninitialized project.

## Acceptance Criteria

- `packref list` prints one `registry:name@version source.type source.host tracking` entry per line.
- `packref list` output is sorted deterministically.
- `packref list` in an empty project prints a helpful message that no packages are currently installed.
- `packref remove npm:react@18.3.1` removes only that project-local reference directory.
- `packref remove npm:react@18.3.1` removes only that lockfile entry.
- `packref remove react` defaults to npm and removes directly when only one version matches.
- `packref remove react` shows a multiselect prompt when multiple versions match.
- `packref remove react` does **not** delete the global store entry.
- Removing an entry whose project directory is already missing succeeds with a warning instead of crashing.
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
