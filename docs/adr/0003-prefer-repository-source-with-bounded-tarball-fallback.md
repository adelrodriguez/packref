---
status: accepted
---

# Prefer repository source with bounded tarball fallback

Packref prefers a tagged repository snapshot because agents benefit from the original source layout,
then falls back to the published npm tarball only when package metadata has no repository, the host is
unsupported, or no matching tag exists. Network, authentication, missing-Git, and supported-host fetch
failures remain visible instead of triggering fallback, because silently switching sources would hide
an actionable environment failure and make provenance harder to understand.

## Consequences

Lock entries record the chosen source so `install` can reproduce it without running selection again.
Repository monorepos retain their full global snapshot and use `repository.directory` for the
project-local materialization when metadata provides it.
