# Plan 05: Sync Command

## Goal

Deliver `packref sync` as a command that asks the active manifest adapter for the project's exact dependency versions, compares them against existing dependency-tracked entries in `.packref/packref-lock.json`, previews the changes, and updates any Packref references that have drifted.

`sync` only reconciles references already managed by Packref. Manifest dependencies with no Packref reference are ignored; users add those explicitly with `packref add`.

The manifest adapter (`lib/manifests/*`) and `nypm` dependency are built in Plan 02 Phase 4; this plan consumes them.

## Status

Implemented. Sync reconciles existing dependency-tracked references without dependency adoption.

## Scope

- Detect the active project manifest through the shared manifest adapter map (built in Plan 02).
- In v1, use the JavaScript manifest adapter to read `package.json` dependency constraints and resolve exact dependency versions using package-manager lockfiles through `nypm` first, `node_modules` second, registry range resolution last.
- Read `.packref/packref-lock.json` to determine currently referenced versions.
- Detect mismatches between the Packref lockfile version and the resolved exact project version.
- For each mismatch, re-run the shared reference pipeline through `lib/references/sync.ts`, reusing the add orchestration for registry resolve, tag discovery, snapshot fetch/reuse (or tarball fallback), reflink, and lockfile update.
- Remove stale dependency-tracked project-local references for old versions.
- Remove dependency-tracked Packref references for packages that are no longer reported by the active manifest adapter.
- Ignore manifest dependencies that have no Packref reference. Adding references belongs to `packref add`.
- Preserve manually-tracked Packref references, including extra versions of dependency packages.
- Before mutating references, print the planned version changes as `current → target` and list dependency-tracked references scheduled for removal.
- Apply the plan without an adoption prompt or any other dependency-selection prompt.
- Report what was updated and removed.
- Add tests for sync behavior.

Version source-of-truth order:

1. package-manager lockfile resolved through `nypm`
2. `node_modules/<package>/package.json`
3. npm registry resolution from the `package.json` range

Registry resolution is the weakest fallback because it may select a newer satisfying version than the project actually has installed.

## Implementation Steps

1. Extend the manifest adapter from Plan 02 if needed (e.g. registry range fallback for packages not resolvable through `nypm` or `node_modules`).
2. Implement `lib/references/sync.ts`: compare manifest-reported exact versions against existing dependency-tracked lockfile entries and produce a structured plan of updates, removals, and unchanged entries. Do not include unreferenced manifest dependencies in the plan.
3. Print the plan before applying it. Version updates show the registry, package name, current version, and target version using `current → target`; removals are listed separately.
4. For each outdated dependency-tracked entry, run the shared reference pipeline for the new version with `tracking: "dependency"`, then remove the old project-local identity path and lockfile entry. A fetch or materialization failure must leave the old working reference intact.
5. For dependency-tracked packages in the lockfile that are no longer reported by the active manifest adapter, remove the project-local reference and remove the package from `.packref/packref-lock.json`. Removal is drift-tolerant: a missing directory does not block lockfile cleanup.
6. Wire `packref sync` in `commands/sync.ts`: delegate to `lib/references/sync.ts` and report progress/errors without prompting for dependency adoption.
7. Report a summary: updated packages, removed packages, already up-to-date packages, and any warnings.
8. Add tests: no drift (all up to date), single package drift, multiple drifts, visible `current → target` preview, package removed from the active manifest, unreferenced manifest dependencies are ignored without a prompt, failed replacement preserves the old reference, `nypm` lockfile resolution, `node_modules` fallback, registry fallback, unsupported manifest, and uninitialized project.

## Acceptance Criteria

- `packref sync` detects when a Packref lockfile entry is at `react@19.0.0` but the active manifest adapter resolves `react` to `19.1.0`, and updates the reference to the resolved exact version.
- `nypm` lockfile resolution is preferred over `node_modules` and registry resolution when a supported package-manager lockfile is present.
- `node_modules/<package>/package.json` is used when no supported package-manager lockfile can resolve the package.
- Registry range resolution is used only when neither a supported lockfile nor `node_modules` can resolve the package.
- Packages already at the correct version are not re-fetched.
- The old dependency-tracked project-local directory is removed when a version changes.
- The global store entry for the old version is **not** deleted (that's prune's job).
- Dependency-tracked packages no longer reported by the active manifest adapter are removed from `.packref/packref-lock.json`, and their project-local reference directories are deleted.
- Before applying changes, `packref sync` shows each pending update as `registry:name current → target` and separately identifies pending removals.
- Manifest dependencies with no Packref reference are ignored and do not cause a prompt; `packref add` is the explicit way to add them.
- `packref sync` does not present an adoption or dependency-selection prompt.
- Manually-tracked entries are preserved by sync even when they are not present in `package.json`, and are never offered for version updates.
- Running sync on an uninitialized project produces `NotInitializedError`.
- Running sync in a project with no supported manifest adapter produces an unsupported-manifest error.
- Running sync with an empty lockfile is a no-op, regardless of how many dependencies the project manifest contains.

## Validation

```sh
bun run format
bun run check
bun run typecheck
bun run test
```

## Out Of Scope

- Pruning old global store entries after sync (use `packref prune`).
- Adding any manifest dependency that does not already have a Packref reference (use `packref add`).
- Interactive or automatic adoption of unreferenced manifest dependencies.
- Rich CLI output formatting.
