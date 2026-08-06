---
status: accepted
---

# Use Packref for dependency source inspection

This project uses the exact dependency versions recorded in `.packref/packref-lock.json` as its source
of truth when implementation details of dependencies—including Effect—must be inspected. Contributors
and agent skills should run `packref install` or `packref add <package>` and read
`.packref/packages/` instead of creating a separate `.repos/` clone, because an independent checkout
can silently differ from the version this project builds against and duplicates the source lifecycle
Packref exists to manage.

## Consequences

Instructions that normally require a vendored checkout are satisfied by the matching Packref source
snapshot. Public documentation remains appropriate for general guidance, but source-level claims must
be checked against the locked local version.
