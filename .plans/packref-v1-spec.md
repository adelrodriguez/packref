# Packref v1 Specification

## One-line description

Packref materializes versioned source copies of npm dependencies so agents can inspect the exact implementation used by a project.

---

# Scope (v1)

Packref is a CLI that:

- Resolves npm packages to a specific version
- Fetches the repository snapshot for that version with `giget`
- Stores it in a deduplicated global store
- Exposes it inside projects for agents to read

Packref is package-reference focused. It does not cache arbitrary repositories in v1.

Packref **does not**:

- install dependencies
- build code
- replace npm/pnpm/yarn
- index code
- fetch npm tarballs as a source fallback
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

The lockfile lives inside `.packref/` for v1. Packref does not create a root-level lockfile.

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
- track whether an entry came from explicit user action (`manual`) or dependency synchronization (`dependency`)
- track source metadata; v1 source entries are always `{ "type": "repository" }`
- track repository host and URL for diagnostics without treating source hosts like package registries
- track optional npm `repository.directory` metadata as `source.directory` for monorepo packages
- rebuild project references
- support pruning

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

---

## add

Add a package reference.

```
packref add react
packref add npm:react
packref add hono
packref add @effect/cli
packref add hono@4.2.0
```

Behavior:

1. Auto-initialize Packref for the project if `.packref/` does not exist
2. Resolve package version
3. Locate repository metadata
4. Resolve matching git tag
5. Fetch repository snapshot with `giget`
6. Store the repository snapshot in the global store
7. Create project reference
8. Update lockfile with `tracking: "manual"` and nested repository `source` metadata

If the exact `registry + name + version` entry already exists, `add` is idempotent. If the same package is already referenced at a different version, the new version is added alongside it. Multiple versions of the same package can coexist.

---

## remove

Remove a package from the project.

```
packref remove react
packref remove npm:react@18.3.1
```

Removes:

- project directory
- lockfile entry

If a remove spec omits the version and multiple matching versions exist, Packref shows a multiselect prompt so the user can choose which versions to remove.

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
4. preserve manually-added entries even if they are not in `package.json`
5. retain old global store entries; `packref prune` removes unused entries later

Dependency source-of-truth order:

1. package-manager lockfile resolved through `nypm`
2. `node_modules/<package>/package.json`
3. npm registry resolution from the `package.json` range

This preserves the goal that Packref references match the dependency version actually used by the project. `nypm` is responsible for identifying and reading the correct package-manager lockfile when one is available.

---

## clean

Remove all entries from the global Packref store.

```
packref clean
```

Algorithm:

1. delete all entries inside `~/.agents/packref/store/`
2. preserve global project registrations
3. leave project-local `.packref/` directories and lockfiles unchanged

# Package Resolution

Resolution steps:

1. read `package.json`
2. determine version constraint
3. resolve concrete version
4. fetch npm metadata
5. find repository URL
6. resolve git tag
7. fetch repository snapshot with `giget`

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

First match is used.

---

# Filesystem Requirements

Preferred:

- APFS / reflink support

Fallback:

- standard copy

---

# Guarantees

Packref guarantees:

- dependency sources match the exact version used
- each version stored once globally
- project paths contain real files
- agents can navigate sources without special tooling

---

# Non-Goals (v1)

Not included in v1:

- non-npm registries such as JSR, PyPI, or crates.io
- arbitrary repository references such as GitHub, GitLab, or Bitbucket repos
- partial cloning
- indexing
- code search
- workspace resolution

---

# Summary

Packref provides a reliable local layer of dependency source code so agents can inspect the exact implementation behind npm packages.
