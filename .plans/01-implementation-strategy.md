# Packref v1 Implementation Strategy

## Technology Choices

| Concern              | Choice                                   | Rationale                                                           |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| CLI framework        | `@effect/cli`                            | Type-safe command definitions, built-in help/validation, composable |
| Core runtime         | `effect`                                 | Structured errors, dependency injection, concurrency, retries       |
| npm registry client  | `npm-registry-fetch` or raw `fetch`      | Lightweight; only need metadata + tarball URLs                      |
| Git operations       | `simple-git` or shell `git` via `Effect` | Need: `ls-remote` (tags), `clone --depth 1 --branch <tag>`          |
| Filesystem (reflink) | `@reflink/reflink`                       | Cross-platform reflink with automatic copy fallback                 |
| Semver               | `semver`                                 | Resolve version ranges, compare, satisfy                            |
| Schema validation    | `@effect/schema`                         | Validate lockfile, config, npm metadata shapes                      |
| Testing              | `bun:test` + `@effect/vitest`            | Already configured in project; Effect test utilities                |

## Module Architecture

```
src/
  bin.ts                  # CLI entry point (packref binary)
  index.ts                # Public API re-exports (library usage)

  cli/
    root.ts               # Root CLI command definition
    init.ts               # packref init
    add.ts                # packref add <pkg>
    remove.ts             # packref remove <pkg>
    list.ts               # packref list
    prune.ts              # packref prune

  core/
    registry.ts           # Fetch npm metadata, resolve versions
    repository.ts         # Discover repo URL, resolve git tags
    snapshot.ts           # Clone snapshot at tag into store
    store.ts              # Global store operations (read/write/check existence)
    project.ts            # Project-level operations (init dir, reflink, lockfile)
    config.ts             # Global config (~/.agents/packref/config.json)
    lockfile.ts           # Project lockfile (packref-lock.json)
    reflink.ts            # Reflink with copy fallback

  lib/
    paths.ts              # Path constants, scoped package name encoding
    errors.ts             # Typed error definitions
    schemas.ts            # @effect/schema definitions for config, lockfile, npm metadata

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

## Implementation Phases

### Phase 1: Foundation

Goal: Project scaffolding, core types, path utilities.

1. Install dependencies (`effect`, `@effect/cli`, `@effect/schema`, `semver`, `@reflink/reflink`, `simple-git`)
2. Set up `bin.ts` entry point with `@effect/cli`
3. Configure `package.json` `bin` field for `packref` command
4. Implement `lib/paths.ts` (store path, project path, scoped name encoding)
5. Implement `lib/errors.ts` (typed error classes)
6. Implement `lib/schemas.ts` (lockfile, config, npm metadata schemas)
7. Write unit tests for paths and schemas

### Phase 2: Registry + Repository

Goal: Resolve a package name to a cloneable git ref.

1. Implement `core/registry.ts`
   - Fetch package metadata from npm registry
   - Resolve version range to concrete version
   - Extract repository URL
2. Implement `core/repository.ts`
   - Normalize repository URL (strip `.git`, handle GitHub shorthand)
   - List remote tags via `git ls-remote --tags`
   - Match version to tag (`v{version}`, `{version}`, `{pkg}@{version}`)
3. Write unit tests (mock fetch, mock git)

### Phase 3: Store + Snapshot

Goal: Clone a snapshot and store it globally.

1. Implement `core/snapshot.ts`
   - `git clone --depth 1 --branch <tag> <url> <store-path>`
   - Strip `.git` directory after clone
2. Implement `core/store.ts`
   - Check if `package@version` already exists in store
   - Get store entry path
   - List all store entries
   - Remove store entry
3. Write unit tests

### Phase 4: Project + Lockfile + Config

Goal: Manage project-level references and global config.

1. Implement `core/lockfile.ts`
   - Read/write/update `packref-lock.json`
   - Add/remove package entries
2. Implement `core/config.ts`
   - Read/write `~/.agents/packref/config.json`
   - Register/unregister projects
3. Implement `core/project.ts`
   - Create `.packref/` directory
   - Reflink store entry into project
   - Remove project reference
4. Implement `core/reflink.ts`
   - Reflink directory recursively with copy fallback
5. Write unit tests

### Phase 5: CLI Commands

Goal: Wire everything together.

1. `packref init` - Create project dir, empty lockfile, register in config
2. `packref add <pkg[@version]>` - Full pipeline: resolve -> clone -> store -> reflink -> lockfile
3. `packref remove <pkg>` - Remove project dir + lockfile entry
4. `packref list` - Read lockfile, print entries
5. `packref prune` - Cross-reference config projects' lockfiles against store, delete orphans
6. Wire root command with subcommands in `cli/root.ts`
7. Write integration tests

### Phase 6: Polish

1. CLI output formatting (spinners, colors via `@effect/cli`)
2. Error messages (actionable, human-readable)
3. Edge cases:
   - Package has no repository field
   - No matching git tag
   - Network failures / retries
   - Corrupted store entry
   - Project not initialized
4. Update `bunup.config.ts` for binary entry point
5. Update `package.json` with `bin`, runtime `dependencies`, etc.
6. Update README with usage docs

## Error Handling Strategy

All errors are modeled as tagged Effect errors:

| Error                  | When                                                 |
| ---------------------- | ---------------------------------------------------- |
| `PackageNotFoundError` | npm registry returns 404                             |
| `NoRepositoryError`    | Package metadata has no repository field             |
| `TagNotFoundError`     | No git tag matches the resolved version              |
| `CloneError`           | `git clone` fails                                    |
| `StoreCorruptedError`  | Store entry exists but is invalid                    |
| `NotInitializedError`  | Running commands in a project without `packref init` |
| `LockfileParseError`   | Lockfile JSON is malformed                           |
| `ConfigParseError`     | Global config JSON is malformed                      |
| `ReflinkError`         | Reflink/copy operation fails                         |
| `NetworkError`         | General fetch failure                                |

Each error carries context (package name, version, path, etc.) for actionable CLI messages.

## Testing Approach

- **Unit tests**: Each `core/` module tested in isolation with mocked I/O (registry fetch, git commands, filesystem)
- **Integration tests**: Full `add` pipeline against real npm packages (small ones like `is-odd`)
- **Test runner**: `bun:test` (already configured)
- **Coverage**: Track via `bun test --coverage`
- **CI**: Existing GitHub Actions pipeline runs tests automatically

## Build + Distribution

- `bunup` builds both the library export (`index.ts`) and the CLI binary (`bin.ts`)
- `package.json` gains a `bin` field: `{ "packref": "dist/bin.js" }`
- Published to npm; users install globally or use `npx packref`
- Runtime dependencies (`effect`, `@effect/cli`, etc.) move from `devDependencies` to `dependencies`

## Open Questions

1. **Monorepo packages**: When a repo is a monorepo (e.g., `@effect/cli` lives in `effect` repo), should we store the full repo or extract the relevant package directory? v1 stores the full repo; extraction can be a v2 feature.
2. **Tarball fallback**: If no git repo is found, should we fall back to downloading the npm tarball? This gives published code (may differ from source). Worth considering for v1 as a fallback.
3. **Lockfile location**: The spec places `packref-lock.json` inside `.packref/`. Should it also live at project root for visibility? Keeping it inside `.packref/` is cleaner.
