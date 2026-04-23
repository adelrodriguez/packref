# Plan 04: Prune Command

## Goal

Deliver `packref prune` as a complete command that cleans up unused global store entries by cross-referencing all registered projects.

## Scope

- Read registered projects from global config.
- Read each project's lockfile.
- Collect all referenced `registry + name + version` store entries.
- Compare references against global store entries.
- Delete unused store entries.
- Handle missing or stale project registrations safely by warning and asking for confirmation before removing stale registrations.
- Add tests for pruning behavior.

## Implementation Steps

1. Implement project lockfile discovery from global config project paths.
2. Handle missing project directories gracefully (warn, don't crash).
3. Handle missing or malformed project lockfiles gracefully.
4. Collect referenced store entry keys across all readable projects using full package identity (`registry + name + version`).
5. List current global store entries.
6. Delete store entries that are not referenced by any project.
7. For stale project registrations, warn and ask for confirmation before removing them from global config.
8. Wire `packref prune` in `commands/prune.ts`.
9. Report what was deleted.
10. Add tests: unused entry deletion, shared dependency retention, empty store, missing project paths, stale registration confirmation, malformed lockfiles.

## Acceptance Criteria

- Store entries referenced by at least one project are retained.
- Store entries referenced by multiple projects are retained.
- Unreferenced store entries are deleted.
- Missing project paths do not crash pruning.
- Stale project registrations are not removed without user confirmation.
- Prune reports what it deleted.

## Validation

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
