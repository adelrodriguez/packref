# Plan 05: Sync Command

## Goal

Deliver `packref sync` as a command that asks the active manifest adapter for the project's exact dependency versions, compares them against dependency-tracked entries in `.packref/packref-lock.json`, and updates any Packref references that have drifted.

## Scope

- Detect the active project manifest through the shared manifest adapter map.
- In v1, use the JavaScript manifest adapter to read `package.json` dependency constraints and resolve exact dependency versions using package-manager lockfiles through `nypm` first, `node_modules` second, registry range resolution last.
- Read `.packref/packref-lock.json` to determine currently referenced versions.
- Use `nypm` inside the JavaScript manifest adapter to identify and read the correct package-manager lockfile instead of implementing package-manager-specific lockfile parsers directly.
- Detect mismatches between the Packref lockfile version and the resolved exact project version.
- For each mismatch, re-run the shared reference pipeline through `lib/references/sync.ts`, reusing the add orchestration for registry resolve, tag discovery, snapshot fetch/reuse, reflink, and lockfile update.
- Remove stale dependency-tracked project-local references for old versions.
- Remove dependency-tracked Packref references for packages that are no longer reported by the active manifest adapter.
- Preserve manually-tracked Packref references, including extra versions of dependency packages.
- Report what was updated.
- Add tests for sync behavior.

Version source-of-truth order:

1. package-manager lockfile resolved through `nypm`
2. `node_modules/<package>/package.json`
3. npm registry resolution from the `package.json` range

Registry resolution is the weakest fallback because it may select a newer satisfying version than the project actually has installed.

## Implementation Steps

1. Implement `lib/manifests/manifest.ts`: define `defineManifest` and the shared manifest adapter contract for dependency detection and exact version resolution.
2. Implement `lib/manifests/index.ts`: register available manifest adapters, detect the active manifest for the current project, and expose normalized dependency constraints plus exact resolved versions.
3. Implement `lib/manifests/javascript.ts`: detect `package.json`, read `dependencies`, `devDependencies`, and `peerDependencies`, and resolve exact npm versions through `nypm`, package-manager lockfiles, `node_modules`, and registry fallback.
4. Add `nypm` as a runtime dependency for package-manager and lockfile detection/resolution.
5. Implement `lib/references/sync.ts`: compare manifest-reported exact versions against dependency-tracked lockfile entries.
6. For each outdated dependency-tracked entry, remove the old project-local identity path, then run the shared reference pipeline for the new version with `tracking: "dependency"`.
7. For dependency-tracked packages in the lockfile that are no longer reported by the active manifest adapter, remove the project-local reference and remove the package from `.packref/packref-lock.json`.
8. Wire `packref sync` in `commands/sync.ts`: delegate to `lib/references/sync.ts` and report progress/errors.
9. Report a summary: updated packages, removed packages, already up-to-date packages, and any warnings.
10. Add tests: no drift (all up to date), single package drift, multiple drifts, package removed from the active manifest, `nypm` lockfile resolution, `node_modules` fallback, registry fallback, unsupported manifest, uninitialized project.

## Acceptance Criteria

- `packref sync` detects when a Packref lockfile entry is at `react@19.0.0` but the active manifest adapter resolves `react` to `19.1.0`, and updates the reference to the resolved exact version.
- `nypm` lockfile resolution is preferred over `node_modules` and registry resolution when a supported package-manager lockfile is present.
- `node_modules/<package>/package.json` is used when no supported package-manager lockfile can resolve the package.
- Registry range resolution is used only when neither a supported lockfile nor `node_modules` can resolve the package.
- Packages already at the correct version are not re-fetched.
- The old dependency-tracked project-local directory is removed when a version changes.
- The global store entry for the old version is **not** deleted (that's prune's job).
- Dependency-tracked packages no longer reported by the active manifest adapter are removed from `.packref/packref-lock.json`, and their project-local reference directories are deleted.
- Manually-tracked entries are preserved by sync even when they are not present in `package.json`.
- Running sync on an uninitialized project produces `NotInitializedError`.
- Running sync in a project with no supported manifest adapter produces an unsupported-manifest error.
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
