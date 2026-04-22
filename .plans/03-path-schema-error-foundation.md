# Plan 03: Path, Schema, Error Foundation

## Goal

Build the shared foundation that later plans can depend on: path helpers, package name encoding, schemas, and typed errors.

## Scope

- Add path utilities for project-local and global Packref locations.
- Add package reference helpers for parsing and encoding package names.
- Add schema validation for lockfiles, global config, and npm metadata shapes needed by v1.
- Add typed errors with enough context for actionable CLI output later.
- Add unit tests for all foundation utilities.

## Implementation Steps

1. Implement path constants and path builders.
2. Implement scoped package folder encoding.
3. Implement package spec parsing for inputs such as `react`, `react@19.0.0`, `@effect/cli`, and `@effect/cli@0.29.0`.
4. Implement schemas for `.packref/packref-lock.json`.
5. Implement schemas for `~/.agents/packref/config.json`.
6. Implement minimal npm metadata schemas required by registry resolution.
7. Implement typed error constructors or tagged classes for expected failure modes.
8. Add unit tests for path encoding, package parsing, schema validation, and error metadata.

## Acceptance Criteria

- Scoped packages use `+` instead of `/` in filesystem folder names.
- Project references resolve under `.packref/`.
- Global store entries resolve under `~/.agents/packref/store/`.
- Lockfile and config schemas reject malformed data.
- Tests cover scoped and unscoped package names.

## Validation

Run:

```sh
bun run format
bun run check
bun run typecheck
bun run test
```

## Out Of Scope

- Reading or writing actual lockfiles.
- Fetching npm registry metadata.
- Running git commands.
- Wiring these utilities into CLI commands.
