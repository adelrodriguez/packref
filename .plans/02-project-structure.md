# Plan 02: Project Structure

## Goal

Create a stable baseline for implementation work. Before adding feature behavior, the repo should have a clear source layout, working quality commands, and agreed filesystem paths for project-local and global Packref data.

## Scope

- Fix or document the expected `bun run format`, `bun run check`, `bun run typecheck`, and `bun run test` workflow.
- Adopt the initial folder structure for planned modules.
- Define the authoritative paths:
  - Project data: `.packref/`
  - Project lockfile: `.packref/packref-lock.json`
  - Global data: `~/.agents/packref/`
  - Global config: `~/.agents/packref/config.json`
  - Global store: `~/.agents/packref/store/`
- Ensure `package.json`, `bin/packref`, build config, imports, and tests agree on the same entrypoints.
- Add module and test stubs only where they establish the structure later feature plans will fill in.

This document describes the concrete steps to go from the current scaffold to a fully structured project ready for business logic.

---

## Current State

What exists:

- `src/index.ts` — Effect CLI composition root with 5 stub subcommands
- `src/version.ts` — build-time package version macro
- `src/commands/{init,add,remove,list,prune}.ts` — stub commands (log TODO messages)
- `src/__tests__/index.test.ts` — single version test
- Runtime deps: `effect`, `@effect/platform-node`
- Dev deps: `@clack/prompts` (installed but unused)

What does not exist:

- `src/commands/{sync,clean}.ts`
- `src/lib/` (entire directory)
- Runtime deps: `semver`, `giget`, `nypm`

---

## Step 1: Install Runtime Dependencies

```bash
bun add semver giget nypm
bun add -d @types/semver
```

These must be `dependencies` (not `devDependencies`) since the CLI uses them at runtime. `@types/semver` is dev-only.

After installing, run `bun run analyze` to confirm knip is satisfied.

---

## Step 2: Create `src/lib/` Module Files

Create every lib module as a minimal stub that exports its public interface. Each file should have a module doc comment explaining its responsibility and empty (or placeholder) exported functions typed against the planned signatures.

Modules are grouped by domain:

```
src/lib/
  errors.ts                         # Tagged domain errors
  schemas.ts                        # @effect/schema models

  resolve/
    registry.ts                     # npm metadata lookup and semver resolution
    repository.ts                   # Normalize repository metadata into giget sources
    snapshot.ts                     # Fetch repo snapshot with giget
    package-manager.ts              # nypm wrapper and PM-aware helpers

  store/
    paths.ts                        # Global/project path helpers and scoped-name encoding
    store.ts                        # Global store operations
    reflink.ts                      # Reflink with copy fallback

  project/
    project.ts                      # Project reference creation/removal
    lockfile.ts                     # .packref/packref-lock.json
    config.ts                       # ~/.agents/packref/config.json

  setup/
    prompter.ts                     # Effect service wrapping @clack/prompts
    agents-md.ts                    # Add/update/remove packref section in AGENTS.md / CLAUDE.md
    gitignore.ts                    # Add/remove .packref/ from .gitignore
    tsconfig.ts                     # Add/remove .packref/ from tsconfig.json exclude
```

---

### Top-level: `errors.ts`

Tagged domain errors using Effect's `Data.TaggedError`. One class per error from the strategy doc.

```ts
export class PackageNotFoundError extends Data.TaggedError("PackageNotFoundError")
export class VersionResolutionError extends Data.TaggedError("VersionResolutionError")
export class ManifestNotFoundError extends Data.TaggedError("ManifestNotFoundError")
export class NoRepositoryError extends Data.TaggedError("NoRepositoryError")
export class UnsupportedRepositoryHostError extends Data.TaggedError("UnsupportedRepositoryHostError")
export class SnapshotFetchError extends Data.TaggedError("SnapshotFetchError")
export class StoreCorruptedError extends Data.TaggedError("StoreCorruptedError")
export class NotInitializedError extends Data.TaggedError("NotInitializedError")
export class LockfileParseError extends Data.TaggedError("LockfileParseError")
export class ConfigParseError extends Data.TaggedError("ConfigParseError")
export class ReflinkError extends Data.TaggedError("ReflinkError")
export class PackageManagerError extends Data.TaggedError("PackageManagerError")
export class NetworkError extends Data.TaggedError("NetworkError")
export class OperationCancelled extends Data.TaggedError("OperationCancelled")
```

### Top-level: `schemas.ts`

`effect/Schema` models for the lockfile, global config, and npm registry response shapes. These are the source of truth for validation and type inference.

Key schemas:

- `LockfileSchema` — `{ packages: Record<string, string> }`
- `GlobalConfigSchema` — `{ projects: string[] }`
- `NpmRegistryResponseSchema` — relevant subset of the npm metadata shape (name, versions, dist-tags, repository)

---

### `resolve/registry.ts`

npm metadata lookup and semver resolution.

- `fetchPackageMetadata(name: string): Effect<NpmRegistryResponse, PackageNotFoundError | NetworkError>`
- `resolveVersion(metadata: NpmRegistryResponse, range: string): Effect<string, VersionResolutionError>`
- `readDeclaredVersion(cwd: string, name: string): Effect<string | null>`

### `resolve/repository.ts`

Normalize npm `repository` metadata into `giget`-compatible source strings.

- `normalizeRepoUrl(repository: RepositoryField): Effect<NormalizedRepo, NoRepositoryError | UnsupportedRepositoryHostError>`
- `buildRefCandidates(version: string, name: string, gitHead?: string): string[]`
- `toGigetSource(repo: NormalizedRepo, ref: string): string`

### `resolve/snapshot.ts`

Fetch repository snapshots with `giget`.

- `fetchSnapshot(source: string, refs: string[]): Effect<string, SnapshotFetchError>` — returns temp directory path
- `validateSnapshot(dir: string): Effect<void, SnapshotFetchError>`

### `resolve/package-manager.ts`

Wraps `nypm` to detect the active package manager and render PM-specific commands.

- `detectPackageManager(cwd: string): Effect<PackageManagerInfo, PackageManagerError>`
- `renderInstallCommand(pm: PackageManagerInfo, pkg: string): string`

---

### `store/paths.ts`

Global and project path helpers. Pure functions, no I/O.

```ts
// Global store root: ~/.agents/packref/
// Global store entry: ~/.agents/packref/store/<pkg>@<version>/
// Project root: <cwd>/.packref/
// Project entry: <cwd>/.packref/<pkg>@<version>/
// Lockfile: <cwd>/.packref/packref-lock.json
// Global config: ~/.agents/packref/config.json

export function globalRoot(): string
export function globalStorePath(): string
export function globalStoreEntry(name: string, version: string): string
export function globalConfigPath(): string
export function projectRoot(cwd: string): string
export function projectEntry(cwd: string, name: string, version: string): string
export function projectLockfilePath(cwd: string): string
export function encodeScopedName(name: string): string // @scope/pkg -> @scope+pkg
export function decodeScopedName(encoded: string): string // @scope+pkg -> @scope/pkg
```

### `store/store.ts`

Global store operations.

- `hasEntry(name: string, version: string): Effect<boolean>`
- `addEntry(name: string, version: string, sourceDir: string): Effect<void>`
- `removeEntry(name: string, version: string): Effect<void>`
- `listEntries(): Effect<StoreEntry[]>`
- `getEntryPath(name: string, version: string): string`

### `store/reflink.ts`

Recursive directory copy using `node:fs` `fs.cp` with `COPYFILE_FICLONE` flag. Attempts copy-on-write reflink where the filesystem supports it (APFS, Btrfs), falls back to regular copy automatically. No native addon needed.

- `reflinkDir(src: string, dest: string): Effect<void, ReflinkError>`

---

### `project/project.ts`

Project reference creation/removal.

- `ensureProjectDir(cwd: string): Effect<void>`
- `materialize(cwd: string, name: string, version: string): Effect<void, ReflinkError>`
- `removeReference(cwd: string, name: string, version: string): Effect<void>`
- `removeAllReferences(cwd: string): Effect<void>`

### `project/lockfile.ts`

Read, create, and update `.packref/packref-lock.json`.

- `readLockfile(cwd: string): Effect<Lockfile, LockfileParseError | NotInitializedError>`
- `writeLockfile(cwd: string, lockfile: Lockfile): Effect<void>`
- `addEntry(cwd: string, name: string, version: string): Effect<void>`
- `removeEntry(cwd: string, name: string): Effect<void>`
- `createEmpty(cwd: string): Effect<void>`

### `project/config.ts`

Read and update `~/.agents/packref/config.json`. Uses `schemas.ts` for validation.

- `readConfig(): Effect<GlobalConfig, ConfigParseError>`
- `writeConfig(config: GlobalConfig): Effect<void>`
- `registerProject(cwd: string): Effect<void>`
- `unregisterProject(cwd: string): Effect<void>`

---

### `setup/prompter.ts`

Effect service wrapping `@clack/prompts`. Same pattern as adamantite's `Prompter`:

- `Prompter` service class with `confirm`, `multiselect`, `intro`, `outro`, `log`, `cancel`, `spinner`
- `Prompter.layer` — live implementation backed by `@clack/prompts`
- All prompts return `Effect<T, OperationCancelled>`
- Cancellation detection via `p.isCancel()`

### `setup/agents-md.ts`

Add/update/remove a packref section in `AGENTS.md` / `CLAUDE.md`.

- `ensureSection(cwd: string, files: string[]): Effect<void>`
- `removeSection(cwd: string, files: string[]): Effect<void>`
- `hasSection(cwd: string, file: string): Effect<boolean>`

Uses `<!-- packref:start -->` / `<!-- packref:end -->` comment markers.

### `setup/gitignore.ts`

Add/remove `.packref/` from `.gitignore`.

- `ensureEntry(cwd: string): Effect<boolean>`
- `removeEntry(cwd: string): Effect<boolean>`
- `hasEntry(cwd: string): Effect<boolean>`

### `setup/tsconfig.ts`

Add/remove `.packref/` from `tsconfig.json` `exclude` array.

- `ensureExclude(cwd: string): Effect<boolean>`
- `removeExclude(cwd: string): Effect<boolean>`
- `hasExclude(cwd: string): Effect<boolean>`

---

## Step 3: Stub `sync` and `clean` Commands

Add two new command files matching the existing stub pattern:

### `src/commands/sync.ts`

```ts
export default Command.make("sync").pipe(
  Command.withDescription("Synchronize package references with current dependency versions"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      yield* Effect.log(
        "TODO: Read package.json versions, compare lockfile, re-fetch drifted packages"
      )
    })
  )
)
```

### `src/commands/clean.ts`

```ts
export default Command.make("clean").pipe(
  Command.withDescription("Remove all package references from the current project"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      yield* Effect.log("TODO: Delete .packref/ contents, reset lockfile")
    })
  )
)
```

Register both in `src/index.ts` alongside the existing subcommands.

---

## Step 4: Create Test File Stubs

```
src/__tests__/
  index.test.ts              (already exists)
  lib/
    paths.test.ts
    schemas.test.ts
    errors.test.ts
    registry.test.ts
    repository.test.ts
    snapshot.test.ts
    store.test.ts
    project.test.ts
    lockfile.test.ts
    config.test.ts
    package-manager.test.ts
    reflink.test.ts
    gitignore.test.ts
    tsconfig.test.ts
    agents-md.test.ts
  integration/
    init.test.ts
    add.test.ts
    sync.test.ts
    clean.test.ts
    prune.test.ts
```

Each test file should import from the corresponding lib module and contain a single `describe` block with a `test.todo` placeholder.

---

## Step 5: Verify

After all files are created:

1. `bun run format` — format everything
2. `bun run check` — lint passes
3. `bun run typecheck` — no type errors
4. `bun run test` — all tests pass (existing + new todos)
5. `bun run analyze` — no unused deps or exports flagged
6. `bun run build` — bunup produces `dist/index.js`

---

## What This Does NOT Cover

This plan sets up the project structure only. It does not implement any business logic. The actual implementation follows the phased approach in `01-implementation-strategy.md`:

- Phase 1 (Foundation) overlaps with this plan — paths, errors, schemas
- Phases 2–6 build on top of this structure
