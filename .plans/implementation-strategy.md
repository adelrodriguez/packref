# Packref v1 Implementation Strategy

Packref v1 is package-reference focused. It supports npm packages only, while keeping `registry` in package identity and paths so future package registries can be added without changing layout. Arbitrary repository references such as GitHub/GitLab/Bitbucket repos are out of scope.

## Technology Choices

| Concern              | Choice                                        | Rationale                                                                                    |
| -------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| CLI framework        | `effect/unstable/cli/*`                       | Effect 4 beta CLI modules used directly                                                      |
| Runtime              | `@effect/platform-node/NodeRuntime`           | Runs the CLI Effect and preserves proper process exit behavior                               |
| Platform services    | `@effect/platform-node/NodeServices`          | Provides Effect 4 beta `FileSystem`, `Path`, and process services                            |
| Service model        | `Context.Service` + `Layer.succeed`           | Provides injectable dependencies for commands and tests                                      |
| npm registry client  | Effect platform HTTP client                   | Reuse the platform client instead of maintaining a thin fetch wrapper                        |
| Lockfile resolution  | `nypm`                                        | v1 JavaScript manifest adapter uses it to detect and read package-manager lockfiles for sync |
| Git tag discovery    | `effect/unstable/process/ChildProcess`        | Avoid `simple-git`; run `git ls-remote` through Effect                                       |
| Snapshot fetching    | `giget`                                       | Fetch repository snapshots by source/ref without maintaining clones                          |
| Filesystem (reflink) | native fs clone/copy helpers behind a service | Keep reflink/copy behavior isolated and testable                                             |
| Semver               | `semver`                                      | Resolve version ranges, compare, satisfy                                                     |
| Schema validation    | `effect/Schema`                               | Effect 4 beta schema module; do not use `@effect/schema`                                     |
| Terminal UI          | `@clack/prompts` behind a `Prompter` service  | Commands do not call Clack directly                                                          |
| Testing              | `bun:test`                                    | Already configured; service layers make I/O mockable                                         |

## Module Architecture

```
src/
  lib/
    core/
      packages.ts         # Package identity, validation, and spec parsing (npm default)
      source.ts           # Shared source metadata/candidate types
      errors.ts           # Data.TaggedError classes with actionable messages
      schemas.ts          # Shared effect/Schema definitions for config and lockfile

    shared/
      filesystem.ts       # Small FileSystem helpers, e.g. ensureDirectory
      json.ts             # JSON parse/stringify helpers backed by Schema.decodeUnknown

    services/
      command-runner.ts   # ChildProcess wrapper for git tag discovery
      prompter.ts         # Clack wrapper for logs/spinners/prompts
      reflinker.ts        # Reflink/copy directory service

    registries/
      registry.ts         # defineRegistry helper and shared registry adapter contract
      index.ts            # Registry adapter map and lookup
      npm/
        resolver.ts       # npm metadata -> resolved package identity + source candidate
        client.ts         # npm registry HTTP client
        metadata.ts       # npm metadata schemas, including repository.directory
      jsr/                # Future adapter placeholder; not implemented in v1
      pypi/               # Future adapter placeholder; not implemented in v1
      crates/             # Future adapter placeholder; not implemented in v1

    manifests/
      manifest.ts         # defineManifest helper and shared manifest adapter contract
      index.ts            # Manifest adapter map, detection, and exact dependency resolution
      javascript.ts       # package.json + JavaScript package-manager lockfile support through nypm
      python.ts           # Future PyPI manifest adapter placeholder; not implemented in v1
      rust.ts             # Future crates manifest adapter placeholder; not implemented in v1

    sources/
      repository/
        normalize.ts      # Normalize repo URL into giget source
        tags.ts           # Resolve git tags through CommandRunner
        fetch.ts          # Fetch repository snapshot at tag/ref with giget
      tarball/            # Future v2 tarball source fetcher

    store/
      paths.ts            # Global/project packages/registry/scope/package/version path helpers
      store.ts            # Global store existence/list/remove operations

    workspace/
      config.ts           # Global config (~/.agents/packref/config.json)
      lockfile.ts         # Project lockfile (packref-lock.json)
      project.ts          # Project-level operations (init dir, references)

    references/
      add.ts              # Add a package reference
      remove.ts           # Remove a package reference
      sync.ts             # Sync package references with project dependencies
      prune.ts            # Remove unused global store entries

  commands/
    init.ts               # packref init
    add.ts                # packref add <pkg>
    remove.ts             # packref remove <pkg>
    list.ts               # packref list
    prune.ts              # packref prune
    sync.ts               # packref sync
    clean.ts              # packref clean

  index.ts                # Root command, runtime wiring, and Effect layers
```

Architecture rules:

- Commands stay thin: parse CLI input, call the matching `lib/references/*` function, and report through `Prompter`.
- Reference modules use simple command-aligned names (`add.ts`, `remove.ts`, `sync.ts`, `prune.ts`) instead of longer names like `add-reference.ts`.
- Tests live beside the code they cover: every folder that has tests gets its own `__tests__/` folder.
- Registry adapters are created with `defineRegistry`. They resolve package metadata into exact package identities and source candidates. They do not build filesystem paths or fetch source trees.
- Manifest adapters are created with `defineManifest`. They detect project dependency files and resolve exact dependency versions for `sync`. They do not fetch package metadata or write Packref files.
- Source fetchers materialize source candidates. Repository hosts such as GitHub/GitLab/Bitbucket are source hosts, not package registries.
- Store and project code accept normalized package identities only; they must not know npm metadata shapes.
- v1 ships only the `npm` registry adapter and JavaScript manifest adapter. Unsupported registry prefixes fail through the shared registry map with `UnsupportedRegistryError`.

## Effect 4 Beta Conventions

- Import Effect modules by concrete module path, e.g. `import * as Effect from "effect/Effect"`, `import * as Schema from "effect/Schema"`, `import * as Command from "effect/unstable/cli/Command"`.
- Do not import from `@effect/cli` or `@effect/schema`; those are pre-Effect-4 package boundaries.
- Run the CLI with `NodeRuntime.runMain(program, { teardown })`.
- Provide platform capabilities with `NodeServices.layer`; command code should request `FileSystem.FileSystem`, `Path.Path`, and service dependencies through Effect.
- Define app services as `Context.Service` classes with a static `layer`, including `Prompter`, `CommandRunner`, registry map, and reflinker services.
- Wrap tag-discovery process execution with `effect/unstable/process/ChildProcess` in a `CommandRunner` service rather than calling shell helpers directly from commands.
- Keep command modules thin: parse CLI args/options, call `lib/references/*`, and log through `Prompter`.

## Implementation Phases

### Phase 1: Foundation

Goal: Project scaffolding, core types, path utilities.

1. Keep `effect` and `@effect/platform-node` on matching Effect 4 beta versions.
2. Install only additional runtime dependencies that are still needed (`semver`, `giget`, `nypm`; optionally `@clack/prompts` if not already present).
3. Set up `src/index.ts` as the CLI entry point using `effect/unstable/cli/Command`, `Command.run`, and `NodeRuntime.runMain`.
4. Provide `NodeServices.layer` plus Packref service layers (`Prompter`, `CommandRunner`, registry map, reflinker) through `Layer.mergeAll`. Use the Effect platform HTTP client from the platform layer for registry HTTP calls instead of adding a Packref-specific HTTP wrapper service.
5. Confirm `package.json` `bin` and `bunup.config.ts` are configured for the `packref` binary.
6. Implement `lib/core/packages.ts` for normalized package identity, path segment helpers, and spec parsing.
7. Implement `lib/store/paths.ts` for global and project package paths using `packages/registry/package/version` and `packages/registry/scope/package/version`.
8. Implement `lib/core/errors.ts` with `Data.TaggedError`.
9. Implement `lib/core/schemas.ts` with shared `effect/Schema` definitions for config and lockfile.
10. Implement `lib/registries/registry.ts` with `defineRegistry` and the shared registry adapter contract.
11. Implement `lib/manifests/manifest.ts` with `defineManifest` and the shared manifest adapter contract.
12. Implement npm-specific schemas in `lib/registries/npm/metadata.ts`, including `repository.directory`.
13. Write unit tests for package identity, paths, schemas, and adapter definitions.

### Phase 2: Registry + Repository

Goal: Resolve a package name to a repository source and matching git ref.

1. Use `parsePackageSpec` from `lib/core/packages.ts` (implemented in Phase 1)
   - Parses `react`, `npm:react`, `react@19.0.0`, `@effect/cli`, and `npm:@effect/cli@0.29.0`
   - Defaults omitted registry to `npm`
   - Rejects unsupported registry prefixes in v1 with a clear error
2. Implement `lib/registries/index.ts`
   - Register available `defineRegistry` adapters keyed by registry
   - Select the resolver for a parsed spec
   - Return `UnsupportedRegistryError` for prefixes not implemented in v1
3. Implement `lib/registries/npm/client.ts` and `lib/registries/npm/resolver.ts`
   - Use the Effect platform HTTP client for registry requests
   - Map platform HTTP failures into Packref's tagged registry/network errors
   - Fetch package metadata from npm registry
   - Resolve version range to concrete version
   - Extract repository URL and optional `repository.directory`
   - Return a normalized package identity plus repository source candidate
4. Implement `lib/sources/repository/normalize.ts` and `lib/sources/repository/tags.ts`
   - Normalize repository URL into a `giget` source (strip `.git`, handle GitHub shorthand)
   - List remote tags via the shared `CommandRunner` service and `git ls-remote --tags`
   - Match version to tag (`v{version}`, `{version}`, `{pkg}@{version}`)
5. Write unit tests (mock platform HTTP client and command runner)

### Phase 2.5: Manifest Adapter

Goal: Read project dependencies through a manifest adapter so `sync` is not tied to `package.json`.

1. Implement `lib/manifests/index.ts`
   - Register available `defineManifest` adapters
   - Detect supported manifest files in the current project
   - Return normalized dependency constraints and exact installed versions
2. Implement `lib/manifests/javascript.ts`
   - Detect `package.json`
   - Read JavaScript dependency groups from `package.json`
   - Resolve exact dependency versions through `nypm`, package-manager lockfiles, `node_modules`, and registry fallback
   - Return normalized dependencies with `registry: "npm"`
3. Write unit tests for manifest detection, dependency reading, and exact version resolution.

### Phase 3: Store + Snapshot

Goal: Fetch a repository snapshot and store it globally.

1. Implement `lib/sources/repository/fetch.ts`
   - Fetch the resolved repository source and tag/ref with `giget`
   - Write the unpacked source tree into the global store path
2. Implement `lib/store/store.ts`
   - Check if `registry + name + version` already exists in store
   - Get nested identity store entry path
   - List all store entries
   - Remove store entry
3. Write unit tests

### Phase 4: Project + Lockfile + Config

Goal: Manage project-level references and global config.

1. Implement `lib/workspace/lockfile.ts`
   - Read/write/update `packref-lock.json`
   - Add/remove package entries
2. Implement `lib/workspace/config.ts`
   - Read/write `~/.agents/packref/config.json`
   - Register/unregister projects
3. Implement `lib/workspace/project.ts`
   - Create `.packref/` directory
   - Reflink store entry into project
   - For monorepo packages with `repository.directory`, expose that package subdirectory as the project-local reference while retaining the full repository snapshot in the global store
   - Remove project reference
4. Implement `lib/services/reflinker.ts`
   - Reflink directory recursively with copy fallback
5. Write unit tests

### Phase 5: CLI Commands

Goal: Wire everything together.

1. Implement `lib/references/*` as shared command logic:
   - `add.ts` - Auto-init if needed, then resolve package -> fetch source -> store copy -> create project reference -> update lockfile
   - `remove.ts` - Remove the project reference and lockfile entry
   - `sync.ts` - Match Packref references to exact project dependency versions and remove dependency-tracked references for dependencies that no longer exist
   - `prune.ts` - Find global store entries no project uses anymore and remove them after confirmation
2. `packref init` - Create project dir, empty lockfile, register in config
3. `packref add <pkg[@version]>` - Parse CLI input, call `references/add.ts`, and report progress/errors
4. `packref remove <pkg>` - Parse CLI input, call `references/remove.ts`, and report progress/errors
5. `packref list` - Read lockfile, print entries; for an empty lockfile, print a helpful "no packages currently installed" message
6. `packref prune` - Call `references/prune.ts` and report progress/errors
7. `packref sync` - Call `references/sync.ts` and report progress/errors
8. `packref clean` - Delete all global store entries, preserving project registrations and project-local `.packref/` directories
9. Wire root command with subcommands in `src/index.ts` using `Command.make(...).pipe(Command.withSubcommands([...]))`.
10. Write integration tests

### Phase 6: Polish

1. CLI output formatting through the `Prompter` service (`@clack/prompts`), not directly in command modules.
2. Error messages (actionable, human-readable)
3. Edge cases:
   - Package has no repository field
   - No matching git tag
   - Network failures / retries
   - Corrupted store entry
   - Project not initialized
4. Update `bunup.config.ts` for binary entry point
5. Update `package.json` with `bin`, runtime `dependencies`, and `imports` matching the implementation.
6. Update README with usage docs

## Error Handling Strategy

All errors are modeled as tagged Effect errors using `Data.TaggedError`:

| Error                      | When                                                      |
| -------------------------- | --------------------------------------------------------- |
| `PackageNotFoundError`     | npm registry returns 404                                  |
| `UnsupportedRegistryError` | Package spec uses a registry prefix not implemented in v1 |
| `NoRepositoryError`        | Package metadata has no repository field                  |
| `TagNotFoundError`         | No git tag matches the resolved version                   |
| `SnapshotFetchError`       | `giget` snapshot fetch fails                              |
| `StoreCorruptedError`      | Store entry exists but is invalid                         |
| `NotInitializedError`      | Running commands in a project without `packref init`      |
| `LockfileParseError`       | Lockfile JSON is malformed                                |
| `ConfigParseError`         | Global config JSON is malformed                           |
| `ReflinkError`             | Reflink/copy operation fails                              |
| `NetworkError`             | General fetch failure                                     |

Each error carries context (package name, version, path, etc.) for actionable CLI messages.

## Testing Approach

- **Unit tests**: Each core, registry, manifest, source, store, reference, and workspace module tested in isolation with mocked I/O services (platform HTTP client, git commands, filesystem)
- **Test placement**: Keep tests inside the nearest folder-level `__tests__/` directory for the code they cover. Do not use a central top-level test folder.
- **Integration tests**: Put integration-style tests in the closest relevant `__tests__/` folder, such as `lib/references/__tests__/add.test.ts` for the full add pipeline against real npm packages (small ones like `is-odd`).
- **Test runner**: `bun:test` (already configured)
- **Coverage**: Track via `bun test --coverage`
- **CI**: Existing GitHub Actions pipeline runs tests automatically

## Build + Distribution

- `bunup` builds the CLI entry (`src/index.ts`) to `dist/index.js`.
- `package.json` keeps the executable shim in `bin/packref`, which points to the built CLI.
- Published to npm; users install globally or use `npx packref`
- Runtime dependencies (`effect`, `@effect/platform-node`, `semver`, `giget`, `nypm`, and any terminal UI package) live in `dependencies`.

## Resolved Behavior Decisions

1. `packref add` auto-initializes the current project when `.packref/` is missing.
2. Adding the same package at a different version creates an additional project-local reference and lockfile entry. Multiple versions can coexist.
3. If snapshot fetch succeeds but project reference creation or lockfile update fails, the fetched global store entry may remain. The project lockfile is updated only after project reference creation succeeds.
4. `packref sync` uses the active manifest adapter to sync Packref package versions with the project's exact dependency versions, not merely rebuild references from the Packref lockfile. In v1, the JavaScript manifest adapter reads `package.json` and resolves exact npm registry versions through `nypm`, package-manager lockfiles, `node_modules`, and registry fallback.
5. Dependency-tracked packages in `packref-lock.json` that are no longer reported by the active manifest adapter are removed from the Packref lockfile and from project-local references. Manually-tracked entries are preserved by sync.
6. `packref prune` warns and asks for confirmation before removing stale project registrations.
7. `packref clean` has no `--global` flag; it only cleans the global store and preserves project registrations and project-local references.
8. Empty `packref list` output is a helpful message stating that no packages are currently installed.
9. Package paths are nested by packages namespace, registry, optional scope, package, and version; e.g. `react@19.0.0` becomes `packages/npm/react/19.0.0`, and `@effect/cli@0.29.0` becomes `packages/npm/@effect/cli/0.29.0`.
10. Monorepo packages store the full repository snapshot globally. If npm metadata includes `repository.directory`, the project-local reference points at that subdirectory; otherwise it points at the repository root. Packref does not attempt heuristic package extraction in v1.
11. The Packref lockfile lives at `.packref/packref-lock.json`; v1 does not create a root-level lockfile.
12. The lockfile uses array entries keyed by full package identity (`registry + name + version`) so multiple versions of the same package can coexist.
13. `packref remove <pkg>` shows a multiselect prompt when the package spec matches multiple versions.
14. v1 implements npm packages only, but registry and manifest adapters use shared `defineRegistry` and `defineManifest` interfaces so future ecosystems can be added without changing command behavior.
15. The lockfile and path model include `registry` so future package registries can be added without changing project layout. Arbitrary repo references remain out of scope.
16. Lockfile source metadata is nested under `source`; GitHub/GitLab/Bitbucket are source hosts discovered from package metadata, not package providers.

## Open Questions

None currently.
