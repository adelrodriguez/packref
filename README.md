<p align="center">
  <h1 align="center">🚚 packref</h1>
  <p align="center">
    <strong>Local, versioned package references for your coding agents.</strong>
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/packref">
    <img src="https://img.shields.io/npm/v/packref.svg" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/packref">
    <img src="https://img.shields.io/npm/dm/packref.svg" alt="npm downloads">
  </a>
  <a href="https://github.com/metaideas/packref/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/metaideas/packref.svg" alt="license">
  </a>
</p>

Packref gives coding agents local copies of the exact dependency source used by a project. Agents
can inspect implementation details without guessing from documentation, cloning an unrelated
revision, or reading a different installed version.

Packref installs source for inspection only. It does not install runtime dependencies, modify your
dependency manifest, or replace your package manager.

---

## Features

- **🎯 Exact source alignment**: Reference the package versions that the project actually uses.
- **🔎 Repository-first inspection**: Prefer tagged repository source and retain monorepo layout when
  package metadata identifies a subdirectory.
- **📦 Reliable fallback**: Use the published npm tarball when repository source is not available.
- **🔒 Reproducible references**: Commit one Packref lockfile so every contributor can materialize
  the same package source references.
- **♻️ Shared source snapshots**: Reuse immutable package source across projects through a
  deduplicated global store.
- **🤖 Agent-ready guidance**: Add clear instructions that tell coding agents where and when to read
  dependency source.
- **🧭 Safe reconciliation**: Sync dependency-tracked references without changing manual references
  or adopting unrelated dependencies.
- **🧰 Package-manager neutral**: Work alongside Bun, npm, pnpm, and Yarn without replacing runtime
  dependency installation.

## Quick start

Initialize Packref from the root of a project:

```sh
npx packref init
```

Initialization creates `.packref/packref-lock.json`, registers the project for global-store
pruning, and can update `.gitignore`, `tsconfig.json`, and `AGENTS.md` with Packref guidance.

### Non-interactive setup for agents

Use `--non-interactive` to initialize Packref entirely from flags. Add `--ignore` to update
`.gitignore` and exclude `.packref` from TypeScript. Add `--agents` to write Packref guidance to
`AGENTS.md`.

```sh
# Initialize only the Packref lockfile and project registration
npx packref init --non-interactive

# Recommended unattended setup for coding agents
npx packref init --non-interactive --ignore --agents
```

Omitted setup flags are disabled. The `--ignore` and `--agents` flags require
`--non-interactive`; without setup flags, `packref init` keeps the interactive setup flow.

Add the exact installed version of a dependency, or request a package and version explicitly:

```sh
npx packref add react
npx packref add hono@4.2.0
npx packref add @effect/cli
```

Running `packref add` without a package opens a multiselect of dependencies not yet referenced.
When a dependency has no installed version in a package-manager lockfile or `node_modules`, Packref
resolves its manifest range against the registry and tells you to install dependencies and sync.

Commit `.packref/packref-lock.json` with the project. After cloning, restore every locked source
reference with:

```sh
npx packref install
```

`install` follows the committed lockfile exactly. It does not resolve project dependencies, adopt
new dependencies, or change lockfile contents.

## Commands

### `packref init`

Initialize the current project, create or preserve its lockfile, register it globally, and offer to
write ignore rules and agent guidance. Use `--non-interactive` with `--ignore` and/or `--agents` for
an unattended setup. If a committed lockfile already has entries, run `npx packref install`
afterward to materialize them.

### `packref add [package]`

Add a package source reference. A versionless dependency uses the project's exact installed version
when available. Explicit versions such as `hono@4.2.0` are tracked manually. Omit the package to
select one or more unresolved project dependencies interactively.

### `packref install`

Materialize missing source trees from `.packref/packref-lock.json`. Matching global snapshots are
reused; missing snapshots are fetched from the source metadata already recorded in the lockfile.

### `packref list`

List the current project's references in deterministic order, including version, source host or
tarball type, and a marker for manually tracked entries. Also available as `packref ls`.

### `packref remove [package]`

Remove matching project-local source trees and lockfile entries. Omit the package to select from all
references. If a name matches multiple versions, Packref asks which versions to remove. Also
available as `packref rm`.

```sh
npx packref remove react
npx packref remove react@18.3.1
```

### `packref sync`

Update existing dependency-tracked references to the exact versions resolved for the project and
remove dependency-tracked references no longer present in the manifest. Manual references are
preserved, and unreferenced manifest dependencies are not automatically adopted.

```sh
npx packref sync
```

### `packref prune`

Remove global store entries unused by every registered project. Missing or unreadable registered
projects are reported and prevent unsafe pruning; stale registrations can be removed interactively.

```sh
npx packref prune
```

### `packref clean`

Clear all references from the current project and reset its lockfile after confirmation. Use the
global flag to wipe only the global source store; registered projects and project-local state are
preserved.

```sh
npx packref clean
npx packref clean --global
```

## Files and storage

- `.packref/packref-lock.json` — committed package identities, exact versions, source metadata, and
  dependency/manual tracking modes.
- `.packref/packages/` — ignored, generated project-local source trees agents inspect.
- `~/.agents/packref/store/` — deduplicated global source snapshots reused across projects.
- `~/.agents/packref/config.json` — registered project paths used by `packref prune`.

Only `.packref/packages/` and temporary lockfile writes should be ignored. The lockfile is the
reproducibility boundary and belongs in version control.

## Source resolution

For npm packages, Packref prefers repository source when registry metadata points to a supported Git
host (GitHub, GitLab, Bitbucket, or SourceHut) and the repository has a tag matching the resolved
package version. Repository snapshots retain the repository layout and, when metadata specifies one,
the package's monorepo directory.

Packref falls back to the published npm tarball when repository metadata is missing, the repository
host is unsupported, or no matching version tag exists. It does not silently fall back when Git is
missing or a supported repository download fails, because those are actionable environment or
network failures.

## Operational boundaries

- Packref currently supports npm packages and JavaScript projects with `package.json`.
- Fetching repository source requires Git, which Packref uses to discover matching version tags.
- Package-manager lockfiles and `node_modules` are used to discover exact installed versions; the
  npm registry is the final resolution fallback.
- Source trees are read-only references for agents, not runtime dependencies.
- Packref assumes one process mutates its project and global files at a time. There is no concurrent
  writer locking in v1.
- Multiple versions of the same package can coexist.

## Agent skill

Install the first-party Packref skill to teach coding agents when and how to inspect the exact local
dependency source:

```sh
npx skills add metaideas/packref --list
npx skills add metaideas/packref --skill packref
```

See the [`packref` skill on skills.sh](https://skills.sh/metaideas/packref/packref).

Made with [🥐 `pastry`](https://github.com/adelrodriguez/pastry)
