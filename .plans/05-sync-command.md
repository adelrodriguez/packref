# Plan 05: Sync Command

## Goal

Deliver `packref sync` as a command that asks the active manifest adapter for the project's exact dependency versions, compares them against dependency-tracked entries in `.packref/packref-lock.json`, updates any Packref references that have drifted, and offers to adopt manifest dependencies that are not referenced yet.

The manifest adapter (`lib/manifests/*`) and `nypm` dependency are built in Plan 02 Phase 4; this plan consumes them.

## Scope

- Detect the active project manifest through the shared manifest adapter map (built in Plan 02).
- In v1, use the JavaScript manifest adapter to read `package.json` dependency constraints and resolve exact dependency versions using package-manager lockfiles through `nypm` first, `node_modules` second, registry range resolution last.
- Read `.packref/packref-lock.json` to determine currently referenced versions.
- Detect mismatches between the Packref lockfile version and the resolved exact project version.
- For each mismatch, re-run the shared reference pipeline through `lib/references/sync.ts`, reusing the add orchestration for registry resolve, tag discovery, snapshot fetch/reuse (or tarball fallback), reflink, and lockfile update.
- Remove stale dependency-tracked project-local references for old versions.
- Remove dependency-tracked Packref references for packages that are no longer reported by the active manifest adapter.
- Adoption: collect manifest dependencies with no Packref reference at all and show a multiselect prompt; add selected packages with `tracking: "dependency"` through the shared add pipeline. Skipping the prompt adopts nothing.
- Preserve manually-tracked Packref references, including extra versions of dependency packages.
- Report what was updated, adopted, and removed.
- Add tests for sync behavior.

Version source-of-truth order:

1. package-manager lockfile resolved through `nypm`
2. `node_modules/<package>/package.json`
3. npm registry resolution from the `package.json` range

Registry resolution is the weakest fallback because it may select a newer satisfying version than the project actually has installed.

## Implementation Steps

1. Extend the manifest adapter from Plan 02 if needed (e.g. registry range fallback for packages not resolvable through `nypm` or `node_modules`).
2. Implement `lib/references/sync.ts`: compare manifest-reported exact versions against dependency-tracked lockfile entries.
3. For each outdated dependency-tracked entry, remove the old project-local identity path, then run the shared reference pipeline for the new version with `tracking: "dependency"`.
4. For dependency-tracked packages in the lockfile that are no longer reported by the active manifest adapter, remove the project-local reference and remove the package from `.packref/packref-lock.json`. Removal is drift-tolerant: a missing directory does not block lockfile cleanup.
5. Implement adoption: collect manifest dependencies with no Packref reference, show a multiselect prompt through `Prompter`, and add selected packages with `tracking: "dependency"` via the shared add pipeline.
6. Wire `packref sync` in `commands/sync.ts`: delegate to `lib/references/sync.ts` and report progress/errors.
7. Report a summary: updated packages, adopted packages, removed packages, already up-to-date packages, and any warnings.
8. Add tests: no drift (all up to date), single package drift, multiple drifts, package removed from the active manifest, adoption prompt adds selected packages with dependency tracking, declining adoption adds nothing, `nypm` lockfile resolution, `node_modules` fallback, registry fallback, unsupported manifest, uninitialized project.

## Acceptance Criteria

- `packref sync` detects when a Packref lockfile entry is at `react@19.0.0` but the active manifest adapter resolves `react` to `19.1.0`, and updates the reference to the resolved exact version.
- `nypm` lockfile resolution is preferred over `node_modules` and registry resolution when a supported package-manager lockfile is present.
- `node_modules/<package>/package.json` is used when no supported package-manager lockfile can resolve the package.
- Registry range resolution is used only when neither a supported lockfile nor `node_modules` can resolve the package.
- Packages already at the correct version are not re-fetched.
- The old dependency-tracked project-local directory is removed when a version changes.
- The global store entry for the old version is **not** deleted (that's prune's job).
- Dependency-tracked packages no longer reported by the active manifest adapter are removed from `.packref/packref-lock.json`, and their project-local reference directories are deleted.
- Manifest dependencies with no Packref reference are offered for adoption through a multiselect prompt; selected packages are added with `tracking: "dependency"`.
- Declining or skipping the adoption prompt adopts nothing and is not an error.
- Manually-tracked entries are preserved by sync even when they are not present in `package.json`, and are never offered for version updates.
- Running sync on an uninitialized project produces `NotInitializedError`.
- Running sync in a project with no supported manifest adapter produces an unsupported-manifest error.
- Running sync with an empty lockfile and no unreferenced manifest dependencies is a no-op.

## Validation

```sh
bun run format
bun run check
bun run typecheck
bun run test
```

## Out Of Scope

- Pruning old global store entries after sync (use `packref prune`).
- Adding packages that are not project manifest dependencies (use `packref add`).
- Automatic (promptless) adoption of manifest dependencies.
- Rich CLI output formatting.
