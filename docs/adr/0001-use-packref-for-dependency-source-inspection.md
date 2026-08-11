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

Source inspection can also identify version-specific operations that replace local collection ceremony.
For example, the locked Effect version provides `Array.partition`, which applies a `Result`-returning
filter and returns transformed failure and success arrays as a tuple. Use this operation when code must
classify one collection into two transformed outputs. Do not force it onto classifications that must also
discard a third outcome.
