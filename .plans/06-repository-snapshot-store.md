# Plan 06: Repository + Snapshot Store

## Goal

Turn resolved package metadata into a reusable source snapshot in the global Packref store.

## Scope

- Normalize repository URLs into cloneable git URLs.
- Discover remote tags.
- Match resolved package versions to likely git tags.
- Clone source snapshots into the global store.
- Strip git metadata from stored snapshots.
- Add store helpers for checking, listing, and removing entries.
- Add tests for repository and store behavior.

## Implementation Steps

1. Implement repository URL normalization for common npm repository formats.
2. Implement `git ls-remote --tags` integration.
3. Implement tag matching for `v{version}`, `{version}`, and `{package}@{version}`.
4. Implement global store entry path helpers using Plan 03 utilities.
5. Implement store existence checks and entry listing.
6. Implement snapshot cloning with `git clone --depth 1 --branch <tag>`.
7. Remove `.git` from cloned snapshots.
8. Reuse existing valid store entries instead of cloning again.
9. Add tests using mocked git commands and temporary directories.

## Acceptance Criteria

- Store entries are named as encoded `package@version` folders.
- Existing store entries are reused.
- Missing tags produce `TagNotFoundError`.
- Clone failures produce `CloneError`.
- Stored snapshots do not include `.git`.
- Store listing returns deterministic results.

## Validation

Run:

```sh
bun run format
bun run check
bun run typecheck
bun run test
```

## Out Of Scope

- Project-local reflink behavior.
- Updating lockfiles.
- User-facing `packref add`.
- Tarball fallback.
