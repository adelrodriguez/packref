# Packref v1 Specification

## One-line description

Packref materializes versioned source copies of npm dependencies so agents can inspect the exact implementation used by a project.

---

# Scope (v1)

Packref is a CLI that:

- Resolves npm packages to a specific version, preferring the version the project actually uses
- Fetches the repository snapshot for that version with `giget`
- Falls back to the published npm tarball when no repository snapshot can be fetched
- Stores it in a deduplicated global store
- Exposes it inside projects for agents to read

Packref is package-reference focused. It does not cache arbitrary repositories in v1.

Packref **does not**:

- install dependencies
- build code
- replace npm/pnpm/yarn
- index code
- cache arbitrary GitHub/GitLab/Bitbucket repositories

It only provides **reference source trees**.

---

# Core Idea

Agents often need to inspect dependency source code.

Example:

```ts
import { Effect } from "effect"
```

The agent should be able to open:

```
.packref/packages/npm/effect/2.0.0/
```

and inspect the real implementation.

Packref guarantees that this source matches the **exact dependency version**.

---

# Directory Layout

## Global store

Location:

```
~/.agents/packref/
```

Structure:

```
~/.agents/packref/
  config.json
  store/
    packages/
      npm/
        react/
          19.0.0/
        hono/
          4.2.0/
        @effect/
          cli/
            0.29.0/
```

Rules:

- store entries are nested by `packages/<registry>/<package>/<version>` for unscoped packages
- scoped package entries are nested by `packages/<registry>/<scope>/<package>/<version>`
- v1 implements only the `npm` package registry, but registry remains part of the package identity and path model

Example:

```
react@19.0.0 -> packages/npm/react/19.0.0
@effect/cli@0.29.0 -> packages/npm/@effect/cli/0.29.0
```

---

## Project layout

```
project/
  .packref/
    packref-lock.json
    packages/
      npm/
        react/
          18.3.1/
          19.0.0/
        @effect/
          cli/
            0.29.0/
```

Project directories are created using **reflinks** from the global store.

This provides:

- zero disk duplication
- normal filesystem paths
- no symlinks

For packages published from monorepos, Packref stores the full repository snapshot globally. If npm metadata includes `repository.directory`, the project-local reference points at that package subdirectory inside the stored snapshot. If `repository.directory` is absent, the project-local reference points at the repository root. Packref does not attempt heuristic package extraction in v1.

---

# Lockfile

Each project stores:

```
.packref/packref-lock.json
```

The lockfile lives inside `.packref/` for v1 and is committed to version control. Packref does not
create a root-level lockfile. Materialized `.packref/packages/` source trees remain local and are
ignored.

Example:

```json
{
  "packages": [
    {
      "registry": "npm",
      "name": "react",
      "version": "18.3.1",
      "tracking": "manual",
      "source": {
        "type": "repository",
        "host": "github",
        "url": "https://github.com/facebook/react"
      }
    },
    {
      "registry": "npm",
      "name": "react",
      "version": "19.0.0",
      "tracking": "dependency",
      "source": {
        "type": "repository",
        "host": "github",
        "url": "https://github.com/facebook/react"
      }
    },
    {
      "registry": "npm",
      "name": "@effect/cli",
      "version": "0.29.0",
      "tracking": "manual",
      "source": {
        "type": "repository",
        "host": "github",
        "url": "https://github.com/Effect-TS/effect",
        "directory": "packages/cli"
      }
    }
  ]
}
```

Purpose:

- track referenced packages
- support multiple versions of the same package in the same project
- leave room for future registries by storing `registry` on every package entry
- track whether an entry came from explicit user action (`manual`) or dependency tracking (`dependency`)
- track source metadata; v1 `source.type` is `"repository"` or `"tarball"`
- track repository host and URL for diagnostics without treating source hosts like package registries
- track optional npm `repository.directory` metadata as `source.directory` for monorepo packages
- rebuild project references
- support pruning

Tarball-backed entries record the source as:

```json
{
  "source": {
    "type": "tarball",
    "url": "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz"
  }
}
```

## Tracking rules

- `tracking: "dependency"` — created when `packref add <pkg>` is run without an explicit version and the package is declared in the project manifest, or when `packref sync` adopts a manifest dependency. These entries are updated and removed by `sync`.
- `tracking: "manual"` — created when the user gives an explicit version/range (`packref add react@18.0.0`), or when the package is not in the project manifest. These entries are never touched by `sync`.

---

# Global Config

```
~/.agents/packref/config.json
```

Example:

```json
{
  "projects": ["/Users/dev/project-a", "/Users/dev/project-b"]
}
```

Used for:

- locating project lockfiles
- pruning unused store entries

---

# CLI Commands

Implementation note: commands are implemented with Effect 4 beta CLI modules (`effect/unstable/cli/Command`, `Argument`, and `Options`) and are registered from `src/index.ts`.

## init

Initialize Packref in the current project.

```
packref init
```

Creates:

```
.packref/
.packref/packref-lock.json
```

Registers the project in the global config.

Also performs project integration (implemented, each step idempotent):

- adds `.packref/packages/` and `.packref/.packref-lock-*.tmp` to `.gitignore`, migrating exact
  legacy `.packref` / `.packref/` rules (with confirmation prompt)
- adds `.packref` to the `exclude` list in `tsconfig.json` when one exists (JSONC-aware; warns on malformed files instead of crashing)
- writes a Packref usage section into `AGENTS.md` between `PACKREF:START`/`PACKREF:END` markers (with confirmation prompt; replaces the section on re-run)

---

## install

Materialize all source references already recorded in the committed lockfile.

```
packref install
```

Behavior:

1. require an initialized project and valid `.packref/packref-lock.json`
2. register the canonical project path globally
3. process lockfile entries in deterministic identity order
4. leave an existing project-local reference unchanged
5. otherwise reuse a global store entry only when its source metadata matches the lockfile
6. fetch a missing repository or tarball source directly from the locked metadata
7. create the project-local reference, respecting `source.directory`
8. leave the lockfile byte-for-byte unchanged

`packref install` restores Packref source references only. It does not install runtime dependencies
and does not replace a package-manager install. `install` follows the lockfile; `sync` may change
dependency-tracked lock entries to match the current project.

---

## add

Add a package reference.

```
packref add
packref add react
packref add npm:react
packref add hono
packref add @effect/cli
packref add hono@4.2.0
```

Behavior:

1. Auto-initialize Packref for the project if `.packref/` does not exist
2. When no package is given, list project manifest dependencies that have no Packref reference, show a multiselect prompt, and add the selected packages
3. Resolve package version:
   - explicit version/range in the spec → resolve against the npm registry
   - no version given and the package is declared in the project manifest → resolve the exact installed version (package-manager lockfile via `nypm` → `node_modules/<pkg>/package.json` → registry range resolution)
   - no version given and not in the manifest → registry `latest`
4. Locate repository metadata
5. Resolve matching git tag
6. Fetch repository snapshot with `giget`; if no repository source is fetchable, fall back to the npm tarball (see Source Fallback)
7. Store the snapshot in the global store
8. Create project reference
9. Update lockfile with nested `source` metadata and tracking:
   - `tracking: "dependency"` when the version came from the project manifest
   - `tracking: "manual"` when the user gave an explicit version/range or the package is not in the manifest

If the exact `registry + name + version` entry already exists, `add` is idempotent. If the same package is already referenced at a different version, the new version is added alongside it. Multiple versions of the same package can coexist.

---

## remove

Remove a package from the project.

```
packref remove
packref remove react
packref remove npm:react@18.3.1
```

Removes:

- project directory
- lockfile entry

If a remove spec omits the version and multiple matching versions exist, Packref shows a multiselect prompt so the user can choose which versions to remove.

If no remove spec is given, Packref shows every referenced package version in a multiselect prompt and removes the selected entries.

---

## list

List referenced packages.

```
packref list
```

Example output:

```
npm:react@18.3.1 repository github manual
npm:react@19.0.0 repository github dependency
npm:@effect/cli@0.29.0 repository github manual
```

---

## prune

Remove unused store entries.

```
packref prune
```

Algorithm:

1. read global config
2. load every project lockfile
3. collect referenced package identities (`registry + name + version`)
4. warn and ask for confirmation before removing stale project registrations
5. delete unused store directories

---

## sync

Update Packref package versions to match the project's declared dependency versions.

```
packref sync
```

Algorithm:

1. read `package.json`
2. read `.packref/packref-lock.json`
3. for each dependency-managed package in the Packref lockfile:
   - resolve the exact project version using the dependency source-of-truth order
   - if the version changed, remove the old dependency-managed project-local reference and add the new version
   - if the package no longer exists in `package.json`, remove the project-local reference and lockfile entry
4. adoption: collect manifest dependencies with no Packref reference at all and show a multiselect prompt; selected packages are added with `tracking: "dependency"` through the shared add pipeline
5. preserve manually-added entries even if they are not in `package.json`
6. retain old global store entries; `packref prune` removes unused entries later

Dependency source-of-truth order:

1. package-manager lockfile resolved through `nypm`
2. `node_modules/<package>/package.json`
3. npm registry resolution from the `package.json` range

This preserves the goal that Packref references match the dependency version actually used by the project. `nypm` is responsible for identifying and reading the correct package-manager lockfile when one is available.

---

## clean

Remove every reference from the current project, or remove all entries from the global Packref store with `--global` / `-g`.

```
packref clean
packref clean --global
```

Local algorithm:

1. require an initialized project
2. ask for confirmation
3. delete all entries inside the project's `.packref/packages/`
4. reset `.packref/packref-lock.json` to an empty package list
5. preserve the global store and project registration

Global algorithm:

1. ask for confirmation
2. delete all entries inside `~/.agents/packref/store/`
3. preserve global project registrations
4. leave project-local `.packref/` directories and lockfiles unchanged

# Package Resolution

Resolution steps:

1. determine version constraint (explicit spec, or the project manifest when no version is given)
2. resolve concrete version (manifest packages: `nypm` lockfile → `node_modules` → registry; otherwise registry)
3. fetch npm metadata
4. find repository URL
5. resolve git tag
6. fetch repository snapshot with `giget`
7. if no repository source is fetchable, fall back to the npm tarball

---

# Repository Discovery

Repository URL comes from:

```
npm registry metadata
```

Example:

```
repository.url
```

Typical value:

```
https://github.com/facebook/react.git
```

Supported source hosts (fetchable through `giget`):

- github.com
- gitlab.com
- bitbucket.org
- sourcehut (git.sr.ht)

Repositories on any other host cannot be fetched in v1 and fall back to the npm tarball.

---

# Tag Matching

Given version:

```
4.2.0
```

Attempt tags:

```
v4.2.0
4.2.0
pkg@4.2.0
```

First match is used. When no tag matches, Packref falls back to the npm tarball.

---

# Source Fallback (Tarball)

Repository snapshots are preferred because they include tests, docs, and monorepo context. When a repository snapshot cannot be fetched, Packref falls back to the published npm tarball for the exact resolved version.

Fallback triggers (metadata-level gaps only):

- package metadata has no repository field
- repository host is not a supported source host
- no git tag matches the resolved version

Fallback does **not** trigger for:

- network failures
- authentication failures (e.g. private repositories)
- corrupted store entries
- unexpected snapshot fetch errors

These fail loudly instead, so a transient error never silently changes the source type.

Tarball-backed entries:

- unpack into the same `packages/<registry>/.../<version>` store path model
- record `source.type: "tarball"` and the tarball URL in the lockfile
- never have a `source.directory` (tarballs already contain only the package)

---

# Filesystem Requirements

Preferred:

- APFS / reflink support

Fallback:

- standard copy

Store writes are atomic: snapshots are fetched into a temporary directory and renamed into the store path only on success, so an interrupted fetch never leaves a partial entry that later commands would reuse.

---

# Guarantees

Packref guarantees:

- dependency sources match the exact version used
- each version stored once globally
- project paths contain real files
- agents can navigate sources without special tooling
- the lockfile always states whether a reference came from a repository snapshot or a tarball

---

# Assumptions (v1)

- Single-process use: Packref does not lock the global store or config. Two packref processes mutating the store concurrently is undefined behavior in v1.
- `git` must be installed and on `PATH` for repository tag discovery; a missing binary produces a clear, actionable error.

---

# Non-Goals (v1)

Not included in v1:

- non-npm registries such as JSR, PyPI, or crates.io
- arbitrary repository references such as GitHub, GitLab, or Bitbucket repos
- partial cloning
- indexing
- code search
- workspace resolution
- concurrent-process locking

---

# Summary

Packref provides a reliable local layer of dependency source code so agents can inspect the exact implementation behind npm packages.
