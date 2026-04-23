# Plan 07: CLI Polish + Docs + Release Prep

## Goal

Prepare the v1 implementation for real use by tightening CLI output, documentation, packaging, and release metadata.

## Scope

- Improve user-facing success and error messages across all commands.
- Confirm CLI help text is useful.
- Update README with usage documentation.
- Confirm build output and binary packaging.
- Confirm release metadata is ready without creating a changeset until the package has a valid release baseline.
- Run final quality gates.

## Implementation Steps

1. Review command output for `init`, `add`, `list`, `remove`, `prune`, `sync`, and `clean`.
2. Convert typed errors into concise, actionable CLI messages.
3. Update README with install, init, add, list, remove, prune, sync, and clean examples.
4. Confirm `bin` configuration points to the packaged CLI output.
5. Confirm package `files` include the expected build artifacts.
6. Run build and inspect output.
7. Confirm whether the project has a valid release baseline before creating any changeset.
8. Run the full validation sequence.

## Acceptance Criteria

- README explains what Packref does and does not do.
- README documents `.packref/` and `~/.agents/packref/`.
- CLI help includes all commands.
- CLI errors are human-readable and actionable.
- Package build output includes the executable CLI.
- No changeset is required until the project has a valid release baseline.

## Validation

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
- Tarball fallback; tracked as a v2 feature.
