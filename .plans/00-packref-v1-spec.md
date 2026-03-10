# Packref v1 Specification

## One-line description
Packref materializes versioned source copies of npm dependencies so agents can inspect the exact implementation used by a project.

---

# Scope (v1)

Packref is a CLI that:

- Resolves npm packages to a specific version
- Fetches the repository snapshot for that version
- Stores it in a deduplicated global store
- Exposes it inside projects for agents to read

Packref **does not**:

- install dependencies
- build code
- replace npm/pnpm/yarn
- index code

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
.agents/packref/effect@2.0.0/
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
    react@19.0.0/
    hono@4.2.0/
    @effect+cli@0.29.0/
```

Rules:

- one folder per `package@version`
- scoped packages use `+` instead of `/`

Example:

```
@effect/cli -> @effect+cli
```

---

## Project layout

```
project/
  .agents/
    packref/
      react@19.0.0/
      @effect+cli@0.29.0/
      packref-lock.json
```

Project directories are created using **reflinks** from the global store.

This provides:

- zero disk duplication
- normal filesystem paths
- no symlinks

---

# Lockfile

Each project stores:

```
packref-lock.json
```

Example:

```json
{
  "packages": {
    "react": "19.0.0",
    "@effect/cli": "0.29.0"
  }
}
```

Purpose:

- track referenced packages
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
  "projects": [
    "/Users/dev/project-a",
    "/Users/dev/project-b"
  ]
}
```

Used for:

- locating project lockfiles
- pruning unused store entries

---

# CLI Commands

## init

Initialize Packref in the current project.

```
packref init
```

Creates:

```
.agents/packref/
packref-lock.json
```

Registers the project in the global config.

---

## add

Add a package reference.

```
packref add react
packref add hono
packref add @effect/cli
packref add hono@4.2.0
```

Behavior:

1. Resolve package version
2. Locate repository
3. Resolve matching git tag
4. Clone snapshot
5. Store in global store
6. Create project reference
7. Update lockfile

---

## remove

Remove a package from the project.

```
packref remove react
```

Removes:

- project directory
- lockfile entry

---

## list

List referenced packages.

```
packref list
```

Example output:

```
react@19.0.0
@effect/cli@0.29.0
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
3. collect referenced packages
4. delete unused store directories

---

# Package Resolution

Resolution steps:

1. read `package.json`
2. determine version constraint
3. resolve concrete version
4. fetch npm metadata
5. find repository URL
6. resolve git tag
7. clone snapshot

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

- GitHub repos directly
- partial cloning
- indexing
- code search
- workspace resolution

---

# Summary

Packref provides a reliable local layer of dependency source code so agents can inspect the exact implementation behind npm packages.
