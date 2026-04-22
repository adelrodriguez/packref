# Plan 09: Prune Command

## Goal

Implement global store cleanup by deleting snapshots that are no longer referenced by registered projects.

## Scope

- Read registered projects from global config.
- Read each project lockfile.
- Collect all referenced `package@version` store entries.
- Compare references against global store entries.
- Delete unused store entries.
- Handle missing or stale project registrations safely.
- Add tests for shared dependencies and stale config entries.

## Implementation Steps

1. Implement project lockfile discovery from global config project paths.
2. Handle missing project directories.
3. Handle missing or malformed project lockfiles.
4. Collect referenced store entry keys across all readable projects.
5. List current global store entries.
6. Delete store entries that are not referenced.
7. Decide whether stale project registrations should be retained, warned about, or removed.
8. Wire `packref prune`.
9. Add tests for unused deletion, shared dependency retention, empty store, missing projects, and malformed lockfiles.

## Acceptance Criteria

- Store entries referenced by at least one project are retained.
- Store entries referenced by multiple projects are retained.
- Unreferenced store entries are deleted.
- Missing project paths do not crash pruning.
- Prune reports what it deleted.

## Validation

Run:

```sh
bun run format
bun run check
bun run typecheck
bun run test
```

## Out Of Scope

- Automatic package upgrades.
- Project-local cleanup beyond reading lockfiles.
- Tarball fallback.
- Monorepo package extraction.
