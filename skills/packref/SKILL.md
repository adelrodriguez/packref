---
name: packref
description: Inspects the exact dependency source a project references through Packref. Use when tracing a package's implementation, debugging exact-version integration behavior, comparing referenced versions, materializing missing Packref source, or when the user mentions Packref.
---

# Packref

Inspect the exact dependency source recorded for this project instead of guessing from
documentation, another installed version, or an arbitrary repository revision. Packref
materializes source references for inspection, not runtime dependencies.

## Workflow

1. Check for `.packref/packref-lock.json`, then run `npx packref list` in an initialized project to
   orient before fetching or removing anything.
2. Read the lockfile. Match `registry`, `name`, and exact `version`; also note `tracking` and
   `source`. When multiple versions of a package coexist, select the version the task requires.
3. Reuse an existing source tree before running a mutating command:
   - Unscoped: `.packref/packages/<registry>/<package>/<version>/`
   - Scoped: `.packref/packages/<registry>/<scope>/<package>/<version>/`, retaining the leading
     `@` in `<scope>`.
4. If the matching lock entry exists but its tree is missing, run `npx packref install`. It restores
   all locked references exactly without changing the lockfile or installing runtime dependencies.
5. If no matching lock entry exists in an initialized project, run `npx packref add <package>` only
   when fetching the requested source is in scope. Include `@<version>` when an exact version is
   required; otherwise Packref can track the project's resolved manifest dependency.
6. Search the materialized tree with local tools such as `rg`, `rg --files`, and targeted file
   reads. Start at exports or the named public API and follow imports into the implementation.
7. Cite the relevant project-local paths. Label verified implementation facts separately from
   inference.

For a repository source with `source.directory`, the project-local reference already contains
that package subdirectory as its root. Use the field as provenance for the monorepo mapping; do not
append it to the local reference path.

## Command boundaries

- `npx packref init`: Initialize only with user authorization. It is interactive and may update
  `.gitignore`, `tsconfig.json`, `AGENTS.md`, the Packref lockfile, and Packref's global project
  registration. If Packref is absent, explain this setup before proceeding.
- `npx packref add [package]`: Resolve and materialize a missing reference. With no package, it opens
  an interactive dependency selector.
- `npx packref install`: Restore missing trees from the committed lockfile exactly.
- `npx packref sync`: Reconcile dependency-tracked references after manifest or package-manager
  lockfile changes; it may update or remove those references.
- `npx packref remove [package]`: Use only when removal is explicitly requested.
- `npx packref prune`, `npx packref clean`, and `npx packref clean --global`: Use only when the user explicitly
  requests their destructive scope.

## Examples

- For `@effect/platform@0.90.0`, read
  `.packref/packages/npm/@effect/platform/0.90.0/` after matching its lock entry.
- If `npm:react@19.1.0` is locked but its tree is absent, run `npx packref install`, then inspect the
  restored unscoped path.
- If `hono` is neither locked nor materialized, run `npx packref add hono` in an initialized project,
  then read the exact identity and source selected in the updated lockfile.
- If both `npm:hono@4.2.0` and `npm:hono@4.3.0` are locked, each version has its own directory;
  read the one the task requires, or compare both when the task is a version comparison.

## Failure and fallback

If a command fails, inspect its error and confirm initialization, the lock entry, network access,
and package identity. Use registry metadata or web research only when the exact source cannot be
materialized, state that limitation, and distinguish fallback evidence from Packref-verified
implementation.
