# Plan 06: Clean Command

## Goal

Deliver `packref clean` as a command that removes all references from the current project, with a `--global` / `-g` mode that removes all entries from the global Packref store.

## Status

Implemented. Local clean asks for confirmation, removes project references, and resets the project lockfile. Global clean asks for confirmation and removes the complete global store tree while preserving global project registrations and project-local Packref state.

## Scope

- By default, delete all entries inside the current project's `.packref/packages/` and reset its lockfile.
- With `--global` / `-g`, delete all entries inside `~/.agents/packref/store/`.
- Preserve global project registrations in `~/.agents/packref/config.json`.
- Preserve the global store during local cleaning.
- Leave project-local `.packref/` directories and lockfiles unchanged during global cleaning.
- Allow global cleaning from any current directory, including uninitialized projects.
- Add tests for local and global clean behavior.

## Implementation Steps

1. Implement local project clean: delete `.packref/packages/` and reset the lockfile.
2. Implement global store clean: delete all entries inside `~/.agents/packref/store/`.
3. Do not delete or mutate `~/.agents/packref/config.json`.
4. Do not mutate the global store during local cleaning or project-local state during global cleaning.
5. Wire `packref clean --global` and its `-g` alias in `commands/clean.ts`.
6. Allow global clean to work regardless of whether the current directory is an initialized project.
7. Ask for confirmation and report how many entries were removed.
8. Add tests for local clean, global clean, confirmation, scope isolation, and uninitialized projects.

## Acceptance Criteria

- `packref clean` deletes all project-local package references and resets the lockfile.
- `packref clean --global` deletes all entries inside `~/.agents/packref/store/`.
- Local clean does **not** delete or mutate the global store.
- Global clean does **not** delete or mutate project-local `.packref/` directories.
- Neither mode deletes or mutates `~/.agents/packref/config.json`.
- Running global clean works from any directory, initialized or not.
- Clean reports what was removed.

## Validation

```sh
bun run format
bun run check
bun run typecheck
bun run test
```

## Out Of Scope

- Selective cleaning of individual global store entries.
