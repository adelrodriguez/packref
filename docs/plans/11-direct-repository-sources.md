# Plan 11: Direct Repository Sources

## Goal

Support adding a repository snapshot directly, without going through a package registry:
`packref add github:owner/repo[@ref]`, bare `owner/repo[@ref]` (defaulting to GitHub), and the
other hosts the repository source layer already knows (`gitlab:`, `bitbucket:`, `sourcehut:`),
plus full HTTPS/SSH repository URLs.

## Status

Not started. Independent of the multi-registry groundwork (Plan 10) and the registry adapters
(Plans 12–14) — this adds a source path, not a registry, and must not touch
`SUPPORTED_REGISTRIES` or the `registryAdapters` record.

## Context

Most of the machinery already exists but is only reachable through npm registry metadata (the
repository-first flow in `materializePackageReferenceToProject`, `src/lib/references/add.ts`):

- `normalizeRepositorySource` (`src/lib/sources/repository/normalize.ts`) already parses
  `github:owner/repo`, bare `owner/repo` (defaulting to GitHub), `gitlab:`/`bitbucket:`/
  `sourcehut:~user/repo` shorthands, standard URLs, and SCP-like SSH URLs into a
  `NormalizedRepositorySource` with a giget-compatible `fetchSource`.
- `fetchRepositorySnapshot` (`src/lib/sources/repository/fetch.ts`) downloads `fetchSource#ref`
  via giget into the store.
- The lockfile `RepositorySource` (`src/lib/core/source.ts`) already records
  `{ type: "repository", host, url, directory? }`, and `createProjectReference`
  (`src/lib/workspace/project.ts`) already materializes references into `directory` with an
  escape guard.

The gaps:

- `parsePackageSpec` (`src/lib/core/packages.ts`) treats any `prefix:` as a registry, so
  `github:owner/repo` fails with `UnsupportedRegistryError`, and bare `owner/repo` is misparsed
  as an npm name that later fails path-segment validation.
- `resolveRepositoryRef` only matches tags derived from a registry version
  (`getTagCandidates` in `src/lib/sources/repository/tags.ts`); there is no path for "the user
  gave me a ref (or no ref at all)".
- `getPackageIdentitySegments` rejects unscoped names containing `/`, so `owner/repo` has no
  store path.
- Lockfile entries have no version to pin without a registry.

## Design Decisions

- **Identity model.** A repo reference is a normal `PackageEntry`: `registry` = provider name
  (`"github"`, `"gitlab"`, `"bitbucket"`, `"sourcehut"`), `name` = `owner/repo`, `version` = the
  pinned ref (see below). `PackageEntry.registry` is `Schema.String`, so no lockfile schema
  change; store path becomes `packages/github/<owner>/<repo>/<version>`. Providers are NOT added
  to `SUPPORTED_REGISTRIES` — keep a separate `SUPPORTED_REPOSITORY_PROVIDERS` list (the
  `SHORTHAND_PROVIDERS` keys already encode it).
- **Ref pinning (reproducibility).** The lockfile version must be immutable and must be one valid
  path segment:
  - No ref given → resolve the default branch HEAD to a commit SHA via `git ls-remote` and pin
    the abbreviated (12-hex) SHA. Verify giget/codeload accepts abbreviated SHAs; fall back to
    the full SHA if not.
  - Ref is an existing tag (per `ls-remote --tags`) and the tag has no `/` or `\\` → pin the tag
    name verbatim.
  - Ref is an existing tag that contains `/` or `\\` → resolve the tag to its full commit SHA and
    pin the SHA. Do not pass a slash-containing version to `getPackageIdentitySegments`.
  - Ref is a branch → resolve to its commit SHA and pin the SHA (not the branch name).
  - Ref is a full 40-hex commit SHA (no matching tag/branch) → normalize to lowercase and pin it.
    Require the full SHA so one commit cannot produce multiple store identities.
- **Subdirectory support.** `github:owner/repo/sub/dir[@ref]` maps the extra path to
  `RepositorySource.directory`; the store keeps the full repo snapshot and the project reference
  points into the subdirectory (existing behavior for npm monorepo packages).
- **Spec parsing seam.** `parsePackageSpec` returns a tagged union:
  `ParsedPackageSpec = RegistryPackageSpec | RepositoryPackageSpec`. Repository detection runs
  before the registry-prefix check: provider prefixes, bare `owner/repo` shape, `://` URLs, and
  `git@`-style SCP URLs. Everything else keeps current behavior, including
  `UnsupportedRegistryError` for unknown prefixes.

## Implementation Steps

1. Extend `parsePackageSpec` in `src/lib/core/packages.ts` to the tagged union above. Parse the
   repository locator before its optional `@ref`. Ignore an `@` in URL user information: for an
   SCP-like URL, only an `@` after the host/path `:` can start the ref; for a standard URL, only
   an `@` after the URL authority can start the ref. Thus, `git@github.com:owner/repo` and
   `ssh://git@github.com/owner/repo` have no ref, while a later `@ref` suffix is parsed. Refs can
   contain `/` but not `@`.

   Migrate all `ParsedPackageSpec` consumers. `src/commands/add.ts`, `src/commands/remove.ts`,
   `src/lib/references/add.ts`, `src/lib/references/remove.ts`, and
   `src/lib/workspace/lockfile.ts` accept the full union and branch on its tag where necessary.
   `resolvePackageReference` in `src/lib/registries/index.ts` and `RegistryAdapter.resolve` in
   `src/lib/registries/registry.ts` accept only `RegistryPackageSpec`; repository specs must not
   enter a registry adapter. Keep `findPackageEntries` behind a common selector so `remove`
   accepts repository specs through the existing provider/name match. With no ref, removal finds
   all pinned versions. With a ref, it matches an exact lockfile version; for a slash-containing
   tag that was pinned as a SHA, the user can remove by repository name or by that pinned SHA.

2. Generalize `getPackageIdentitySegments` to split any name containing exactly one `/` into two
   path segments (the scoped-name branch already does this for `@scope/name`), so
   `owner/repo` produces `packages/<provider>/<owner>/<repo>/<version>`.
3. Add a direct-ref resolver in `src/lib/sources/repository/` (e.g. `resolveDirectRepositoryRef`):
   normalize the spec through `normalizeRepositorySource`, run `git ls-remote` through a
   repository-specific reader like `RemoteTagReader` in `tags.ts`, extended to list heads + HEAD,
   and
   apply the pinning rules above to produce a `ResolvedRepositoryRef` plus the pinned version.
4. Wire a repository branch into `addPackageReference`/`addPackageReferenceToProject`
   (`src/lib/references/add.ts`): skip manifest-dependency lookup and registry resolution,
   build the `PackageIdentity` from provider/name/pinned version, then reuse
   `fetchRepositorySnapshot` → `createProjectReference` → `upsertPackageEntry` with
   `tracking: "manual"`.
5. Fix the reinstall path in `fetchLockedStoreEntry` (`src/lib/references/install.ts`). Detect a
   direct repository entry by its provider from `SUPPORTED_REPOSITORY_PROVIDERS`, and use
   `entry.version` as the exact ref for both tag-pinned and SHA-pinned entries. Do not call
   `resolveRepositoryRef` or `getTagCandidates` for these entries. Registry-derived repository
   fallbacks continue to use the existing fuzzy tag candidates.
6. Verify the other commands: `list` prints entries as-is; `remove` uses the full parsed-spec
   union and the common lockfile selector from step 1; `sync` only touches manifest-tracked
   entries (repo entries are `manual`); `prune` and `clean` operate on identities.
7. Tests: unit tests for spec parsing (all forms, URL user information, refs containing `/`, and
   ambiguity with npm names and scoped packages), pinning rules with a mocked repository ref
   reader, removal selectors, exact-ref reinstall behavior, and store-path segments. Include a repository
   with both `1.0` and `v1.0` tags and a slash-containing tag. Add one integration test in
   `src/lib/references/__tests__/` that adds a small real repo by tag and by bare `owner/repo`,
   then runs `install` from a clean store.
8. Update README (spec forms table + a "add straight from GitHub" example), the init-generated
   AGENTS.md section, and `packref add --help` text.
9. Add a minor changeset.

## Acceptance Criteria

- `packref add github:owner/repo`, `packref add owner/repo`, `packref add owner/repo@v1.2.3`,
  and `packref add gitlab:owner/repo@<sha>` all materialize a reference and a lockfile entry
  with `registry: "<provider>"`, `name: "owner/repo"`, an immutable `version`, and a
  `repository` source.
- A slash-containing tag resolves to a SHA-backed store path and does not produce
  `InvalidPackageIdentity` for the version.
- SCP-like and standard SSH URLs with user information parse without treating the user-info `@`
  as a ref separator.
- Deleting the store and running `packref install` uses the exact stored ref and reproduces the
  same snapshot for both tag-pinned and SHA-pinned entries, including when both `1.0` and `v1.0`
  tags exist.
- `packref add npm:foo`, `packref add foo`, and `packref add @scope/foo@1.2.3` behave exactly as
  before (no registry regressions).
- `list`, `remove`, `sync`, `prune`, and `clean` handle repository entries without
  special-casing.
- `bun run check` and `bun run test` pass.

## Validation

```sh
bun run format
bun run check
bun run test
```

## Out Of Scope

- Private repositories / auth tokens (giget supports `GIGET_AUTH`; document as a follow-up).
- Arbitrary self-hosted git servers beyond what `normalizeRepositorySource` already accepts
  (unknown hosts have no `fetchSource` and should fail with a clear error).
- Update/outdated flows for repo refs (re-resolving a branch to a newer SHA).
- Registry work (Plans 10, 12–14).
