# Plan 09: CLI Polish + Docs + Release Prep

## Goal

Prepare the v1 implementation for real use by tightening CLI output, documentation, packaging, and release metadata.

## Status

Implemented. Command help and errors are actionable, the complete v1 workflow is documented, and
the executable package contents have been verified. A minor changeset
(`.changeset/first-minor-release.md`) covers the first release.

## Scope

- Improve user-facing success and error messages across all commands.
- Confirm CLI help text is useful.
- Update README with usage documentation.
- Confirm build output and binary packaging.
- Confirm the package has a valid release baseline, then create the release changeset.
- Run final quality gates.

## Implementation Steps

1. Review command output for `init`, `add`, `install`, `list`, `remove`, `prune`, `sync`, and `clean`.
2. Convert typed errors into concise, actionable CLI messages.
3. Update README with package installation, init, add, committed-lockfile install, list, remove, prune, sync, and clean examples.
4. Confirm `bin` configuration points to the packaged CLI output.
5. Confirm package `files` include the expected build artifacts.
6. Run build and inspect output.
7. Confirm whether the project has a valid release baseline before creating any changeset.
8. Run the full validation sequence.

## Acceptance Criteria

- README explains what Packref does and does not do.
- README documents the committed `.packref/packref-lock.json`, ignored `.packref/packages/`, and `~/.agents/packref/`.
- README explains repository vs tarball sources, the fallback rules, and the single-process (no locking) assumption.
- CLI help includes all commands.
- CLI errors are human-readable and actionable.
- Package build output includes the executable CLI.
- Release metadata includes a changeset based on the project's valid release baseline.

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
- Changes to the repository-to-tarball fallback implemented in Plan 02.
