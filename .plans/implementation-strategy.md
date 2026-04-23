# Packref v1 Implementation Strategy

Packref v1 is package-reference focused. It supports npm packages only, while keeping `registry` in package identity and paths so future package registries can be added without changing layout. Arbitrary repository references such as GitHub/GitLab/Bitbucket repos are out of scope.

## Technology Choices

| Concern              | Choice                                        | Rationale                                                             |
| -------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| CLI framework        | `effect/unstable/cli/*`                       | Effect 4 beta CLI modules used directly                               |
| Runtime              | `@effect/platform-node/NodeRuntime`           | Runs the CLI Effect and preserves proper process exit behavior        |
| Platform services    | `@effect/platform-node/NodeServices`          | Provides Effect 4 beta `FileSystem`, `Path`, and process services     |
| Service model        | `Context.Service` + `Layer.succeed`           | Provides injectable dependencies for commands and tests               |
| npm registry client  | Effect platform HTTP client                   | Reuse the platform client instead of maintaining a thin fetch wrapper |
| Lockfile resolution  | `nypm`                                        | Detect and read the correct package-manager lockfile for sync         |
| Git tag discovery    | `effect/unstable/process/ChildProcess`        | Avoid `simple-git`; run `git ls-remote` through Effect                |
| Snapshot fetching    | `giget`                                       | Fetch repository snapshots by source/ref without maintaining clones   |
| Filesystem (reflink) | native fs clone/copy helpers behind a service | Keep reflink/copy behavior isolated and testable                      |
| Semver               | `semver`                                      | Resolve version ranges, compare, satisfy                              |
| Schema validation    | `effect/Schema`                               | Effect 4 beta schema module; do not use `@effect/schema`              |
| Terminal UI          | `@clack/prompts` behind a `Prompter` service  | Commands do not call Clack directly                                   |
| Testing              | `bun:test`                                    | Already configured; service layers make I/O mockable                  |

## Module Architecture

```
src/
  lib/
    core/
      package-identity.ts # Registry + package name + version identity helpers
      package-spec.ts     # Parse specs with optional registry prefix; npm is default
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
      registry.ts         # Shared RegistryResolver contract and registry map
      npm/
        resolver.ts       # npm metadata -> resolved package identity + source candidate
        client.ts         # npm registry HTTP client
        metadata.ts       # npm metadata schemas, including repository.directory
      jsr/                # Future adapter placeholder; not implemented in v1
      pypi/               # Future adapter placeholder; not implemented in v1
      crates/             # Future adapter placeholder; not implemented in v1

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
      package-json.ts     # Read dependency constraints for sync
      resolved-dependencies.ts # Resolve exact dependency versions via nypm, node_modules, registry fallback

    references/
      add-reference.ts    # Resolve -> fetch/store -> project ref -> lockfile
      remove-reference.ts # Remove project refs and lockfile entries
      sync-references.ts  # Sync dependency-tracked entries with exact project deps
      prune-store.ts      # Cross-project store pruning orchestration

  commands/
    init.ts               # packref init
    add.ts                # packref add <pkg>
    remove.ts             # packref remove <pkg>
    list.ts               # packref list
    prune.ts              # packref prune
    sync.ts               # packref sync
    clean.ts              # packref clean

  index.ts                # Root command, runtime wiring, and Effect layers

  __tests__/
    registry.test.ts
    repository.test.ts
    store.test.ts
    project.test.ts
    lockfile.test.ts
    paths.test.ts
    integration/
      add.test.ts         # End-to-end: add a real package
      init.test.ts
```

Architecture rules:

- Commands stay thin: parse CLI input, call `references/*`, and report through `Prompter`.
- Registry adapters resolve package metadata into exact package identities and source candidates. They do not build filesystem paths or fetch source trees.
- Source fetchers materialize source candidates. Repository hosts such as GitHub/GitLab/Bitbucket are source hosts, not package registries.
- Store and project code accept normalized package identities only; they must not know npm metadata shapes.
- v1 ships only the `npm` registry adapter. Unsupported registry prefixes fail through the shared registry map with `UnsupportedRegistryError`.

## Effect 4 Beta Conventions

- Import Effect modules by concrete module path, e.g. `import * as Effect from "effect/Effect"`, `import * as Schema from "effect/Schema"`, `import * as Command from "effect/unstable/cli/Command"`.
- Do not import from `@effect/cli` or `@effect/schema`; those are pre-Effect-4 package boundaries.
- Run the CLI with `NodeRuntime.runMain(program, { teardown })`.
- Provide platform capabilities with `NodeServices.layer`; command code should request `FileSystem.FileSystem`, `Path.Path`, and service dependencies through Effect.
- Define app services as `Context.Service` classes with a static `layer`, including `Prompter`, `CommandRunner`, registry map, and reflinker services.
- Wrap tag-discovery process execution with `effect/unstable/process/ChildProcess` in a `CommandRunner` service rather than calling shell helpers directly from commands.
- Keep command modules thin: parse CLI args/options, call `references/*` orchestration, and log through `Prompter`.

## Implementation Phases

### Phase 1: Foundation

Goal: Project scaffolding, core types, path utilities.

1. Keep `effect` and `@effect/platform-node` on matching Effect 4 beta versions.
2. Install only additional runtime dependencies that are still needed (`semver`, `giget`, `nypm`; optionally `@clack/prompts` if not already present).
3. Set up `src/index.ts` as the CLI entry point using `effect/unstable/cli/Command`, `Command.run`, and `NodeRuntime.runMain`.
4. Provide `NodeServices.layer` plus Packref service layers (`Prompter`, `CommandRunner`, registry map, reflinker) through `Layer.mergeAll`. Use the Effect platform HTTP client from the platform layer for registry HTTP calls instead of adding a Packref-specific HTTP wrapper service.
5. Confirm `package.json` `bin` and `bunup.config.ts` are configured for the `packref` binary.
6. Implement `lib/core/package-identity.ts` for normalized package identity and path segment helpers.
7. Implement `lib/store/paths.ts` for global and project package paths using `packages/registry/package/version` and `packages/registry/scope/package/version`.
8. Implement `lib/core/errors.ts` with `Data.TaggedError`.
9. Implement `lib/core/schemas.ts` with shared `effect/Schema` definitions for config and lockfile.
10. Implement npm-specific schemas in `lib/registries/npm/metadata.ts`, including `repository.directory`.
11. Write unit tests for package identity, paths, and schemas.

### Phase 2: Registry + Repository

Goal: Resolve a package name to a repository source and matching git ref.

1. Implement `lib/core/package-spec.ts`
   - Parse `react`, `npm:react`, `react@19.0.0`, `@effect/cli`, and `npm:@effect/cli@0.29.0`
   - Default omitted registry to `npm`
   - Reject unsupported registry prefixes in v1 with a clear error
2. Implement `lib/registries/registry.ts`
   - Define a shared registry resolver contract keyed by registry
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

1. `packref init` - Create project dir, empty lockfile, register in config
2. `packref add <pkg[@version]>` - Auto-init if needed, then resolve -> fetch repository snapshot -> store -> reflink -> lockfile
3. `packref remove <pkg>` - Remove project dir + lockfile entry
4. `packref list` - Read lockfile, print entries; for an empty lockfile, print a helpful "no packages currently installed" message
5. `packref prune` - Cross-reference config projects' lockfiles against store, warn and confirm before removing stale project registrations, then delete orphans
6. `packref sync` - Compare Packref references against exact project dependency versions resolved through `nypm`, `node_modules`, and registry fallback; update drifted references and remove references no longer present in `package.json`
7. `packref clean` - Delete all global store entries, preserving project registrations and project-local `.packref/` directories
8. Wire root command with subcommands in `src/index.ts` using `Command.make(...).pipe(Command.withSubcommands([...]))`.
9. Write integration tests

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

- **Unit tests**: Each core, registry, source, store, reference, and workspace module tested in isolation with mocked I/O services (platform HTTP client, git commands, filesystem)
- **Integration tests**: Full `add` pipeline against real npm packages (small ones like `is-odd`)
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
4. `packref sync` follows Plan 05 semantics: sync Packref package versions with exact dependency versions resolved from `package.json` plus `nypm` lockfile resolution, not merely rebuild references from the Packref lockfile.
5. Dependency-tracked packages in `packref-lock.json` that are no longer in `package.json` are removed from the Packref lockfile and from project-local references. Manually-tracked entries are preserved by sync.
6. `packref prune` warns and asks for confirmation before removing stale project registrations.
7. `packref clean` has no `--global` flag; it only cleans the global store and preserves project registrations and project-local references.
8. Empty `packref list` output is a helpful message stating that no packages are currently installed.
9. Package paths are nested by packages namespace, registry, optional scope, package, and version; e.g. `react@19.0.0` becomes `packages/npm/react/19.0.0`, and `@effect/cli@0.29.0` becomes `packages/npm/@effect/cli/0.29.0`.
10. Monorepo packages store the full repository snapshot globally. If npm metadata includes `repository.directory`, the project-local reference points at that subdirectory; otherwise it points at the repository root. Packref does not attempt heuristic package extraction in v1.
11. The Packref lockfile lives at `.packref/packref-lock.json`; v1 does not create a root-level lockfile.
12. The lockfile uses array entries keyed by full package identity (`registry + name + version`) so multiple versions of the same package can coexist.
13. `packref remove <pkg>` shows a multiselect prompt when the package spec matches multiple versions.
14. v1 implements npm packages only, but the lockfile and path model include `registry` so future package registries can be added without changing project layout. Arbitrary repo references remain out of scope.
15. Lockfile source metadata is nested under `source`; GitHub/GitLab/Bitbucket are source hosts discovered from package metadata, not package providers.

## Open Questions

None currently.
