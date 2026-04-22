# Plan 04: Project Init + Lockfile + Global Config

## Goal

Implement the project initialization flow and durable state files required by later commands.

## Scope

- Implement project lockfile read, write, and initialization behavior.
- Implement global config read, write, and project registration behavior.
- Implement `packref init`.
- Make `init` safe to run multiple times.
- Add unit and integration-style tests for initialization.

## Implementation Steps

1. Implement lockfile functions for reading `.packref/packref-lock.json`.
2. Implement lockfile functions for writing an empty or updated lockfile.
3. Implement global config functions for reading `~/.agents/packref/config.json`.
4. Implement global config functions for writing config and registering projects.
5. Implement project initialization that creates `.packref/`.
6. Wire `packref init` to project initialization and project registration.
7. Add tests for fresh initialization, repeated initialization, malformed lockfile handling, and malformed global config handling.

## Acceptance Criteria

- `packref init` creates `.packref/`.
- `packref init` creates `.packref/packref-lock.json`.
- `packref init` creates or updates `~/.agents/packref/config.json`.
- Re-running `packref init` does not duplicate project entries.
- Re-running `packref init` does not destroy existing lockfile package entries.

## Validation

Run:

```sh
bun run format
bun run check
bun run typecheck
bun run test
```

## Out Of Scope

- Adding package references.
- Reflinking store entries into projects.
- Pruning the global store.
- Fetching npm or git data.
