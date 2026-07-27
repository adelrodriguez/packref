# Add Command Phase 3: Repository Source Resolution

> **Status: COMPLETE.** Implemented in `src/lib/sources/repository/` and `src/lib/services/command-runner.ts`. Follow-up amendments (sourcehut provider, unknown-host fallback signal, missing-git-binary error) are tracked in `02-add-command.md` § Phase 3 Amendments. This file can be archived once that work is committed.

## Goal

Implement the repository-resolution stage for `packref add`: take the repository metadata returned by a registry resolver, normalize it into a fetchable source, discover remote tags, and select the tag that matches the resolved package version.

This phase starts from the current codebase state, where Phase 1 and Phase 2 are already implemented in `src/lib/core/*` and `src/lib/registries/*`, and `bun run check` plus `bun run test` are passing as of April 29, 2026. The current concrete adapter is npm, but this phase should depend on the shared `RegistryAdapter` output shape rather than any npm-specific resolver details.

## What This Phase Should Produce

- `src/lib/services/command-runner.ts`
  - Shared Effect service for running external commands.
  - Minimal API for this phase: execute `git ls-remote --tags <repo>`.
  - Maps process failures into typed Packref errors at the call site.
- `src/lib/sources/repository/normalize.ts`
  - Converts npm repository metadata into a normalized repository source.
  - Produces a `giget`-compatible source string plus structured metadata needed later for the lockfile.
- `src/lib/sources/repository/tags.ts`
  - Lists remote tags for a repository.
  - Parses `git ls-remote --tags` output.
  - Chooses a matching tag using the plan’s priority order.
- Focused tests under `src/lib/sources/repository/__tests__/` and `src/lib/services/__tests__/` as needed.

## Scope Boundaries

In scope:

- Repository URL normalization.
- Remote tag discovery.
- Tag parsing and selection.
- Tagged failures for unsupported or unmatchable repository refs.

Out of scope:

- Fetching snapshots with `giget`.
- Store existence checks and materialization.
- Project-local reflinks.
- Lockfile updates.
- CLI wiring beyond what already exists.

## Implementation Plan

### 1. Add the command runner service

Create `src/lib/services/command-runner.ts` with:

- A `CommandRunner` Effect service.
- One method for this phase, for example `run(command: string, args: ReadonlyArray<string>)`.
- A result shape that includes:
  - `stdout`
  - `stderr`
  - exit status

Constraints:

- Keep the service generic enough to reuse in later phases, but do not over-design it.
- Keep git-specific behavior out of the service. Git interpretation belongs in repository helpers.

### 2. Define normalized repository-source types

Extend `src/lib/core/source.ts` if needed so repository resolution has explicit types for:

- Raw repository candidate returned by any registry adapter.
- Normalized repository source for fetching.
- Lockfile-ready repository metadata.

Suggested shape for the normalized type:

- `type: "repository"`
- `host`
- `repositoryUrl`
- `fetchSource`
- optional `directory`

This keeps Phase 3 focused on turning registry metadata into a concrete source description that later phases can consume directly.

Design constraint:

- `src/lib/sources/repository/*` should accept the shared repository source candidate type from `src/lib/core/source.ts`.
- It should not import npm metadata types or make assumptions about how the registry adapter obtained the repository URL.

### 3. Implement repository URL normalization

Create `src/lib/sources/repository/normalize.ts`.

Handle the repository URL formats currently emitted by registry adapters. For v1 that means the shapes coming from the npm adapter, but the normalization boundary should remain registry-agnostic.

Initial formats to support:

- `git+https://github.com/facebook/react.git`
- `https://github.com/facebook/react.git`
- `git://github.com/facebook/react.git`
- `git@github.com:owner/repo.git`
- `github:owner/repo`
- equivalent GitLab and Bitbucket shorthand if easily supported by the same normalization rules

Normalization rules:

- Strip `git+`.
- Strip trailing `.git`.
- Convert SCP-style SSH URLs into an HTTPS-style repository URL for host detection.
- Preserve the canonical repository URL separately from the fetch source if both are useful.
- Produce a `giget` source string in the format expected later by fetch code.

Error handling:

- If the URL is structurally invalid or the host format cannot be normalized, fail clearly.
- Reuse an existing tagged error if one fits; otherwise add the smallest new tagged error needed instead of introducing a broad catch-all.

### 4. Implement tag discovery

Create `src/lib/sources/repository/tags.ts`.

Responsibilities:

- Call `git ls-remote --tags <repositoryUrl>` through `CommandRunner`.
- Parse standard output into tag refs.
- Ignore dereferenced annotated-tag suffixes like `^{}`
- Return a deduplicated list of tag names only.

Failure mapping:

- Transport/process failures should surface as a typed Packref error.
- A successful git call with no matching tag should not be treated as a command error; it should become `TagNotFoundError` during matching.

### 5. Implement version-to-tag matching

In `tags.ts`, add a pure matcher that accepts:

- package name
- resolved version
- candidate tag names

Match in this order:

1. `v{version}`
2. `{version}`
3. `{pkg}@{version}`

Use the full npm package name for the third pattern, including scope when present, unless testing shows the chosen source host requires a different encoded form. If that ambiguity appears, document it and keep the matcher host-agnostic in this phase.

Return:

- the selected tag name
- the full normalized repository source bundle needed by Phase 4 fetch logic

### 6. Add a small orchestration helper for this phase

Create a phase-local helper, either:

- `resolveRepositorySource(...)` in `normalize.ts`, or
- `resolveRepositoryRef(...)` in `tags.ts`

It should compose:

1. normalized repository source creation
2. remote tag listing
3. tag selection

This gives Phase 5 a single call point without prematurely introducing `src/lib/references/add.ts`.

Suggested signature:

- accept `identity` plus a shared `RepositorySourceCandidate`
- return a resolved repository ref independent of which registry adapter produced the candidate

## Test Plan

### Unit tests for normalization

Add `src/lib/sources/repository/__tests__/normalize.test.ts` covering:

- GitHub HTTPS with `git+` and `.git`
- GitHub shorthand `github:owner/repo`
- SSH SCP form `git@github.com:owner/repo.git`
- repository metadata that includes `directory`
- invalid repository strings

Assert:

- normalized host
- canonical repository URL
- fetch source string
- preserved `directory`

Keep these tests framed around shared repository candidates, not npm metadata payloads.

### Unit tests for tag parsing and matching

Add `src/lib/sources/repository/__tests__/tags.test.ts` covering:

- lightweight tags
- annotated tags with duplicate `^{}`
- priority ordering between `v1.2.3`, `1.2.3`, and `react@1.2.3`
- scoped package names such as `@effect/cli`
- empty tag lists

Assert:

- parsed tag-name list is clean and deduplicated
- matcher respects the documented priority
- missing matches fail with `TagNotFoundError`

### Service-level tests

If `CommandRunner` contains non-trivial logic, add `src/lib/services/__tests__/command-runner.test.ts`; otherwise test it indirectly by stubbing the service in repository tests.

Repository tests should primarily stub `CommandRunner` rather than shelling out to real git.

## Suggested File Sequence

1. `src/lib/core/source.ts`
2. `src/lib/services/command-runner.ts`
3. `src/lib/sources/repository/normalize.ts`
4. `src/lib/sources/repository/tags.ts`
5. `src/lib/sources/repository/__tests__/normalize.test.ts`
6. `src/lib/sources/repository/__tests__/tags.test.ts`
7. `src/index.ts` only if the new service needs to be added to the application layer now

## Validation

Run after implementation:

```sh
bun run format
bun run check
bun run test
```

Do not run `bun run analyze` in this phase unless a new dependency is added. Phase 3 should not require one.

## Exit Criteria

This phase is complete when:

- A resolved package reference from any registry adapter can be turned into a normalized repository source.
- The code can discover remote tags for that repository.
- The matching tag is selected deterministically using the documented order.
- Missing matches fail with `TagNotFoundError`.
- The codebase remains green under `format`, `check`, and `test`.
