---
status: accepted
---

# Commit lock metadata and materialize source locally

Packref commits `.packref/packref-lock.json` while ignoring `.packref/packages/` and sharing immutable
snapshots through `~/.agents/packref/store/`. Committing generated source would make repositories
unnecessarily large, while ignoring the lockfile would lose reproducibility; separating authoritative
metadata from materialized source lets collaborators restore exact references with `packref install`
and reuse storage across projects.

## Consequences

The lockfile is the reproducibility boundary and `install` must not resolve or update versions. Project
source directories and the global store are disposable materializations, but deleting the global store
does not alter committed project state.
