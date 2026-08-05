# Plan 08: Committed Lockfile + Install Command

## Goal

Make Packref references reproducible across collaborators by committing
`.packref/packref-lock.json`, ignoring only materialized project-local source trees, and adding
`packref install` to materialize every reference already recorded in the lockfile.

The lockfile is authoritative for `install`. Installing must not resolve project dependency
versions, adopt manifest dependencies, or change lockfile contents; those behaviors belong to
`packref sync` and `packref add`.

## User Experience

After cloning a project with a committed Packref lockfile:

```sh
packref install
```

Packref restores any missing project-local references and reuses matching global store entries
when available.

`packref install` installs Packref source references only. It does not install the project's
runtime dependencies and does not replace `npm install`, `pnpm install`, `yarn install`, or
`bun install`.

## Command Semantics

For every entry in `.packref/packref-lock.json`, in deterministic lockfile order:

1. If the project-local reference already exists, report it as already installed and leave it
   unchanged.
2. Otherwise, if a matching global store entry exists and its stored source metadata matches the
   lockfile entry, create the project-local reference from the store.
3. Otherwise, fetch the source described by the lockfile entry into the global store:
   - repository source: normalize the locked repository URL, resolve the tag for the locked exact
     package version, and fetch the repository snapshot;
   - tarball source: fetch the exact locked tarball URL.
4. Create the project-local reflink/copy using the locked `source.directory` when present.
5. Leave the lockfile byte-for-byte unchanged.

The command installs both `tracking: "dependency"` and `tracking: "manual"` entries. Tracking
controls `sync`; it does not affect installation.

Installation is idempotent and atomic per package. If one package fails, previously completed
references remain valid and rerunning the command resumes by skipping them.

## Git Integration

Packref-generated `.gitignore` rules should ignore generated source trees while allowing the
lockfile to be committed:

```gitignore
.packref/packages/
.packref/.packref-lock-*.tmp
```

`packref init` must migrate an exact existing `.packref` or `.packref/` rule to these narrower
rules. It must preserve unrelated `.gitignore` content and avoid duplicate Packref entries.

Keep `.packref` in `tsconfig.json`'s `exclude`. The TypeScript exclusion prevents dependency
source from entering project compilation and is independent of Git tracking.

Update generated `AGENTS.md` guidance to state that:

- `.packref/packref-lock.json` is shared and committed;
- `.packref/packages/` is local and ignored;
- agents should run `packref install` when locked references are missing;
- `packref sync` changes dependency-tracked lock entries, while `packref install` does not.

## Implementation Steps

1. Update `lib/workspace/integration.ts`:
   - replace the broad `.packref` Git ignore constant with the generated-directory and temporary
     lockfile rules;
   - migrate exact legacy `.packref` and `.packref/` lines in place;
   - preserve comments, unrelated patterns, newline style, and idempotency;
   - keep the current `tsconfig.json` exclusion behavior;
   - revise the generated Packref `AGENTS.md` section.
2. Add workspace/store helpers needed to inspect an expected project reference and load global
   store metadata without materializing or mutating anything.
3. Add a typed source-mismatch error. If the global store already contains the same
   `registry + name + version` with different source metadata, fail with an actionable error
   instead of silently installing source different from the committed lockfile.
4. Implement `lib/references/install.ts` as shared orchestration:
   - require a `.packref` directory and valid lockfile;
   - register the canonical project path in global config;
   - read and deterministically order every lockfile entry;
   - skip existing project references;
   - reuse compatible store entries;
   - fetch missing repository or tarball store entries directly from locked source metadata;
   - create missing project references;
   - return a structured summary of installed, reused, and already-installed entries;
   - never call `upsertPackageEntry` or otherwise write the lockfile.
5. Implement `commands/install.ts`:
   - describe the command as installing references from `packref-lock.json`;
   - run installation with a spinner/progress output through `Prompter`;
   - report counts for newly fetched, reused, and already-installed references;
   - print a helpful no-op message for an empty lockfile.
6. Register `install` in the root command's subcommand list.
7. Update `packref init` output so a discovered non-empty lockfile suggests `packref install`.
   Keep installation explicit rather than making `init` mutate potentially large local state.
8. Update `.plans/packref-v1-spec.md`, `.plans/implementation-strategy.md`, and
   `.plans/07-cli-polish-docs-release.md` to include the committed-lockfile policy and `install`
   command.
9. Update project documentation and CLI help examples with the clone/install workflow and the
   distinction between `install` and `sync`.
10. Do not create a changeset while the package remains at `0.0.0`, per repository policy.

## Tests

### Gitignore and initialization

- A new project receives `.packref/packages/` and the temporary-lockfile ignore rule, not a broad
  `.packref` rule.
- Exact legacy `.packref` and `.packref/` rules are migrated.
- Repeated initialization is idempotent.
- Existing narrow rules are not duplicated.
- Unrelated ignore patterns, comments, missing final newlines, and CRLF files are preserved.
- Declining ignore integration leaves `.gitignore` unchanged.
- `tsconfig.json` continues to exclude `.packref`.
- Generated `AGENTS.md` guidance describes the committed lockfile and `packref install`.

### Install orchestration

- An empty lockfile succeeds as a no-op.
- A missing repository-backed reference is fetched and materialized.
- A missing tarball-backed reference is fetched and materialized.
- A matching global store entry is reused without fetching.
- `source.directory` materializes only the package subdirectory.
- An existing project-local reference is skipped without fetching or copying.
- Both manual and dependency-tracked entries are installed.
- Multiple versions of the same package are installed.
- Scoped packages use the expected project path.
- Invalid lockfile data returns the existing lockfile parse error.
- An absent `.packref` directory returns `NotInitializedError`.
- A mismatched global store source returns the new typed error and does not create a project
  reference.
- A failure partway through leaves earlier completed references intact and a rerun resumes safely.
- The lockfile contents before and after success, partial failure, and no-op installation are
  byte-for-byte identical.
- Project registration uses the canonical real path.

### CLI

- `packref install --help` clearly distinguishes Packref references from project dependencies.
- CLI summaries correctly report fetched, reused, and already-installed counts.
- The command is available from root help.

## Acceptance Criteria

- `.packref/packref-lock.json` is not ignored by Packref-generated Git rules.
- `.packref/packages/` remains ignored and is never intended for version control.
- Existing projects with an exact broad Packref ignore rule are migrated safely by `packref init`.
- A collaborator can clone a repository containing only the Packref lockfile and run
  `packref install` to materialize all locked references.
- Installation includes manual entries and multiple locked versions.
- Installation does not read dependency versions from the project manifest.
- Installation never adds, removes, reorders, or rewrites lockfile entries.
- `packref sync` retains responsibility for reconciling dependency-tracked entries and changing
  the lockfile.
- Repeated installation performs no unnecessary network or filesystem work.
- Store source mismatches fail visibly rather than substituting different source content.

## Reproducibility Boundary

This plan restores the exact package identity and source metadata currently represented by the v1
lockfile. Repository-backed entries are still resolved from the version's remote tag, and remote
tags can theoretically move. Pinning repository commit SHAs and recording tarball integrity is a
separate lockfile-format hardening task; it is not required to make the lockfile team-shareable or
to deliver `packref install`.

## Validation

After implementation:

```sh
bun run format
bun run check
bun run test
```

If dependencies are added or removed during implementation, also run:

```sh
bun run analyze
```

## Out of Scope

- Installing project runtime dependencies.
- Updating locked versions or tracking modes during installation.
- Automatically adopting manifest dependencies.
- Removing lockfile entries whose packages are absent from the manifest.
- Pruning unused global store entries.
- Concurrent-process locking.
- Immutable repository commit pins or tarball integrity fields.
