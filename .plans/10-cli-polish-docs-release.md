# Plan 10: CLI Polish + Docs + Release Prep

## Goal

Prepare the v1 implementation for real use by tightening CLI output, documentation, packaging, and release metadata.

## Scope

- Improve user-facing success and error messages.
- Confirm CLI help text is useful.
- Update README usage documentation.
- Confirm build output and binary packaging.
- Add a changeset.
- Confirm final quality gates pass.

## Implementation Steps

1. Review command output for `init`, `add`, `list`, `remove`, and `prune`.
2. Convert typed errors into concise actionable CLI messages.
3. Update README with install, init, add, list, remove, and prune examples.
4. Confirm `bin` configuration points to the packaged CLI output.
5. Confirm package `files` include the expected build artifacts.
6. Run build and inspect output.
7. Add an appropriate changeset.
8. Run the full validation sequence.

## Acceptance Criteria

- README explains what Packref does and does not do.
- README documents `.packref/` and `~/.agents/packref/`.
- CLI help includes all commands.
- CLI errors are human-readable and actionable.
- Package build output includes the executable CLI.
- A non-major changeset exists unless the user explicitly approves a major bump.

## Validation

Run:

```sh
bun run format
bun run check
bun run typecheck
bun run test
bun run build
```

## Out Of Scope

- New v2 features.
- Monorepo package extraction unless it became part of v1 during execution.
- Tarball fallback unless it was approved during earlier plans.
