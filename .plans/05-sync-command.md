# Plan 05: Sync Command

## Goal

Deliver `packref sync` as a command that compares the versions tracked in `.packref/packref-lock.json` against the exact dependency versions used by the project, then updates any Packref references that have drifted.

## Scope

- Read the project's `package.json` to determine which dependencies are eligible for sync.
- Resolve exact dependency versions using the project source of truth: package-manager lockfile through `nypm` first, `node_modules` second, registry range resolution last.
- Read `.packref/packref-lock.json` to determine currently referenced versions.
- Use `nypm` to identify and read the correct package-manager lockfile instead of implementing package-manager-specific lockfile parsers directly.
- Detect mismatches between the Packref lockfile version and the resolved exact project version.
- For each mismatch, re-run the add pipeline (registry resolve, tag discovery, snapshot clone/reuse, reflink, lockfile update) with the correct version.
- Remove stale dependency-tracked project-local references for old versions.
- Remove dependency-tracked Packref references for packages that are no longer present in `package.json`.
- Preserve manually-tracked Packref references, including extra versions of dependency packages.
- Report what was updated.
- Add tests for sync behavior.

Version source-of-truth order:

1. package-manager lockfile resolved through `nypm`
2. `node_modules/<package>/package.json`
3. npm registry resolution from the `package.json` range

Registry resolution is the weakest fallback because it may select a newer satisfying version than the project actually has installed.

## Implementation Steps

1. Implement `package.json` reading: parse `dependencies`, `devDependencies`, and `peerDependencies` to collect version constraints.
2. Add `nypm` as a runtime dependency for package-manager and lockfile detection/resolution.
3. Implement a resolved dependency provider abstraction that can answer `packageName -> exactVersion` using ordered providers.
4. Implement the package-manager lockfile provider using `nypm`.
5. Implement a `node_modules/<package>/package.json` fallback provider.
6. Implement registry range resolution as the final fallback provider (reuse `lib/packages/registry.ts` from Plan 02).
7. Compare resolved versions against dependency-tracked lockfile entries.
8. For each outdated dependency-tracked entry, remove the old project-local identity path, then run the shared reference pipeline for the new version with `tracking: "dependency"`.
9. For dependency-tracked packages in the lockfile that are no longer in `package.json`, remove the project-local reference and remove the package from `.packref/packref-lock.json`.
10. Wire `packref sync` in `commands/sync.ts`.
11. Report a summary: updated packages, removed packages, already up-to-date packages, and any warnings.
12. Add tests: no drift (all up to date), single package drift, multiple drifts, package removed from `package.json`, `nypm` lockfile resolution, `node_modules` fallback, registry fallback, uninitialized project.

## Acceptance Criteria

- `packref sync` detects when a Packref lockfile entry is at `react@19.0.0` but the project resolves `react` to `19.1.0`, and updates the reference to the resolved exact version.
- `nypm` lockfile resolution is preferred over `node_modules` and registry resolution when a supported package-manager lockfile is present.
- `node_modules/<package>/package.json` is used when no supported package-manager lockfile can resolve the package.
- Registry range resolution is used only when neither a supported lockfile nor `node_modules` can resolve the package.
- Packages already at the correct version are not re-fetched.
- The old dependency-tracked project-local directory is removed when a version changes.
- The global store entry for the old version is **not** deleted (that's prune's job).
- Dependency-tracked packages removed from `package.json` are removed from `.packref/packref-lock.json`, and their project-local reference directories are deleted.
- Manually-tracked entries are preserved by sync even when they are not present in `package.json`.
- Running sync on an uninitialized project produces `NotInitializedError`.
- Running sync with an empty lockfile is a no-op.

## Validation

```sh
bun run format
bun run check
bun run typecheck
bun run test
```

## Out Of Scope

- Pruning old global store entries after sync (use `packref prune`).
- Adding new packages not already in the lockfile (use `packref add`).
- Rich CLI output formatting.
