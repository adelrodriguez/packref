# Plan 06: Clean Command

## Goal

Deliver `packref clean` as a command that removes all entries from the global Packref store.

## Scope

- Delete all entries inside `~/.agents/packref/store/`.
- Preserve global project registrations in `~/.agents/packref/config.json`.
- Leave project-local `.packref/` directories and lockfiles unchanged.
- Work from any current directory, including uninitialized projects.
- Add tests for global store clean behavior.

## Implementation Steps

1. Implement global store clean: delete all entries inside `~/.agents/packref/store/`.
2. Do not delete or mutate `~/.agents/packref/config.json`.
3. Do not read, delete, or mutate the current project's `.packref/` directory.
4. Wire `packref clean` in `commands/clean.ts` with no `--global` flag.
5. Allow `packref clean` to work regardless of whether the current directory is an initialized project.
6. Report how many global store entries were removed.
7. Add tests: global clean with entries, global clean with no store entries, project registrations preserved, project-local references preserved, uninitialized project.

## Acceptance Criteria

- `packref clean` deletes all entries inside `~/.agents/packref/store/`.
- `packref clean` does **not** delete or mutate project-local `.packref/` directories.
- `packref clean` does **not** delete or mutate `~/.agents/packref/config.json`.
- Running `packref clean` works from any directory, initialized or not.
- Clean reports what was removed.

## Validation

```sh
bun run format
bun run check
bun run typecheck
bun run test
```

## Out Of Scope

- Project-local cleanup (use `packref remove` or `packref sync`).
- Selective cleaning of individual global store entries.
