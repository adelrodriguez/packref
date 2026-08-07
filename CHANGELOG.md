# packref

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
