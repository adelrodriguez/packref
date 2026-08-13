# packref

## 0.3.0

### Minor Changes

- 564d46c: Add direct repository package specs for GitHub, GitLab, Bitbucket, and SourceHut sources.

### Patch Changes

- de6e0cb: Improve source reference reliability with domain-typed file errors, bounded network retries, and concurrent independent I/O.
- de6e0cb: Report accurate filesystem operation errors, bound aggregate store traversal concurrency, and report all package source reference failures during install and remove operations.
- d869fb2: Fix internal "Help requested" message leaking into output for empty or invalid CLI input, while keeping exit codes correct (0 for missing arguments, 1 for unknown subcommands)
- de6e0cb: Prepare registry and manifest seams for projects that use multiple package ecosystems.
- 2cf71d0: Add `ls` and `rm` aliases for the `list` and `remove` commands.

## 0.2.0

### Minor Changes

- a355688: Require Node.js 22 or later.

  Recommend `npx packref` as the primary CLI interface in the README and first-party agent skill.

### Patch Changes

- 14f4563: Return a nonzero exit code when a requested non-interactive setup integration cannot be completed.
- 14f4563: Add a non-interactive `packref init` setup for coding agents.

## 0.1.1

### Patch Changes

- 878cefd: Update development dependencies and fix deployment credentials.

## 0.1.0

### Minor Changes

- e460ca8: First release of Packref, a CLI that gives coding agents local, versioned copies of the exact dependency source used by a project.

  - `packref init` — initialize a project: create the lockfile, register the project for global-store pruning, and optionally update `.gitignore`, `tsconfig.json`, and `AGENTS.md`
  - `packref add [package]` — add source references from manifest dependencies or by explicit name/version
  - `packref remove [package]` — remove package references
  - `packref install` — materialize every reference recorded in the committed lockfile
  - `packref sync` — update dependency-tracked lock entries to exact versions resolved from supported lockfiles or installed packages
  - `packref list` — show all referenced packages
  - `packref prune` — remove unused entries from the global store
  - `packref clean` — remove project-local references (`--global` wipes the global store)

  Includes a first-party agent skill, actionable error messages, and project documentation (architecture reference, ADRs, and domain glossary).
