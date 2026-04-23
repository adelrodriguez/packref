# Plan 01: Init Command

## Goal

Deliver `packref init` as a working CLI command that initializes a project for Packref use.

## Scope

- Set up the CLI entry point and root command structure with `effect/unstable/cli/Command`.
- Implement path utilities needed by init (project path, global store path, package identity path helpers).
- Implement shared schemas for the lockfile and global config in `lib/shared/schemas.ts` with `effect/Schema`.
- Implement typed errors needed by init in `lib/shared/errors.ts` (`NotInitializedError`, `LockfileParseError`, `ConfigParseError`).
- Implement lockfile read/write/initialization.
- Implement global config read/write/project registration.
- Implement `packref init` command that creates `.packref/`, writes an empty lockfile, and registers the project in global config.
- Make init idempotent (safe to run multiple times).
- Add tests for init behavior.

## Implementation Steps

1. Keep `effect` and `@effect/platform-node` on matching Effect 4 beta versions.
2. Set up `src/index.ts` as the CLI entry point using `effect/unstable/cli/Command`, `Command.run`, `NodeRuntime.runMain`, and `NodeServices.layer`.
3. Configure `package.json` `bin` field.
4. Implement `lib/shared/paths.ts`: project `.packref/` path, global store path (`~/.agents/packref/`), and package identity path helpers using `packages/registry/package/version` for unscoped packages and `packages/registry/scope/package/version` for scoped packages.
5. Implement `lib/shared/schemas.ts` with lockfile and global config schemas using `effect/Schema`.
6. Implement `lib/shared/errors.ts` with `Data.TaggedError`: `NotInitializedError`, `LockfileParseError`, `ConfigParseError`.
7. Implement `lib/workspace/lockfile.ts`: read, write, and initialize `packref-lock.json`.
8. Implement `lib/workspace/config.ts`: read, write global config; register/unregister projects.
9. Implement `lib/workspace/project.ts`: create `.packref/` directory.
10. Wire `packref init` in `commands/init.ts`: create dir, write empty lockfile, register project.
11. Add tests: fresh init, repeated init preserves existing entries, malformed lockfile handling, malformed config handling.

## Acceptance Criteria

- `packref init` creates `.packref/` directory.
- `packref init` creates `.packref/packref-lock.json` with empty packages.
- `packref init` creates or updates `~/.agents/packref/config.json` with the project path.
- Re-running `packref init` does not duplicate project entries.
- Re-running `packref init` does not destroy existing lockfile package entries.
- `packref --help` shows available commands.

## Validation

```sh
bun run format
bun run check
bun run typecheck
bun run test
```

## Out Of Scope

- Adding, removing, or listing package references.
- Registry resolution.
- Git operations.
- Reflink behavior.
