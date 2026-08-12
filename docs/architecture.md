# Architecture

Packref is a single-process CLI with laminated modules behind narrow interfaces. Product behavior
is documented in the [README](../README.md),
domain terms live in [CONTEXT.md](../CONTEXT.md), and durable tradeoffs live in
[decision records](./adr/README.md).

## Runtime

`src/index.ts` defines the Effect CLI, composes application layers, and translates typed failures
into process exit codes. `@effect/platform-node` provides filesystem, path, process, HTTP, and runtime
capabilities. Commands obtain dependencies through Effect services and do not construct adapters.

The package build has one entry point: Bunup bundles `src/index.ts` to `dist/index.js`, and the
executable `bin/packref` imports that output.

## Module seams

| Lamina and module | Interface and responsibility                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `core`            | Define readonly identities, package specs, sources, persisted-state schemas, adapter interfaces, and errors. |
| `logic`           | Make deterministic decisions from input values without requesting I/O services.                              |
| I/O adapters      | `manifests`, `registries`, `sources`, `store`, `workspace`, and `terminal` perform external effects.         |
| `references`      | Orchestrate logic and adapters into add, install, remove, sync, prune, clean, and resolution workflows.      |
| `commands`        | Parse CLI input, invoke workflows, and render progress or results.                                           |

Commands remain thin so the `references` interface is also the main behavior test seam. Registry and
manifest adapters do not know filesystem layout, while source adapters do not know project manifests
or lockfile mutation rules.

Imports follow the lamination direction. Core models import no outer lamina. Logic imports core
models but not adapters. Adapters import core and logic but not orchestrators. Orchestrators may
compose all inner laminas but do not know CLI or terminal adapters. File-specific
`no-restricted-imports` rules in `oxlint.config.ts` enforce this direction for production code.

### Adding a registry adapter

To add a registry:

1. Add its name to `SUPPORTED_REGISTRIES` in `src/lib/core/registry.ts`.
2. Add a self-contained adapter under `src/lib/registries/<registry>/`.
3. Add the adapter to `registryAdapters` in `src/lib/registries/index.ts`.
4. If the ecosystem has a project manifest, add an adapter under `src/lib/manifests/` and register it
   in `manifestAdapters`.

Registry adapters resolve package specs to exact package identities and source candidates. Manifest
adapters detect and read ecosystem-specific dependency declarations. Neither adapter type owns the
Packref lockfile, global store, or project source directory layout.

## Add and sync flow

```mermaid
flowchart LR
  A["Package spec or tracked lock entry"] --> B["Manifest and registry resolution"]
  B --> C["Repository selection or tarball fallback"]
  C --> D["Atomic global source snapshot"]
  D --> E["Project materialization"]
  E --> F["Atomic Packref lockfile update"]
```

The lockfile changes only after source materialization succeeds. A fetched global snapshot may remain
after a later failure and can be reused safely. Store writes use a temporary directory followed by an
atomic rename.

## Install flow

`install` treats the committed Packref lockfile as authoritative. It neither consults the project
manifest nor resolves newer versions. Each missing project source reference reuses a compatible
global snapshot or fetches the exact source recorded in its lock entry, then materializes it without
rewriting the lockfile.

## Storage model

- Project lockfile: `.packref/packref-lock.json`, committed.
- Project source directory: `.packref/packages/`, generated and ignored.
- Global store: `~/.agents/packref/store/packages/`, shared by package identity.
- Global project registry: `~/.agents/packref/config.json`, used for safe pruning.

Package identity always includes registry, name, and exact version. Scoped names occupy two path
segments. Multiple versions coexist. Repository monorepos retain the full snapshot globally, while a
project source reference materializes `repository.directory` when npm metadata provides it.

## Consistency and failure model

Expected failures are typed Effect errors with concise recovery guidance. Project lockfile writes and
global snapshot writes are atomic. Remove and sync tolerate missing materialized directories while
still repairing lockfile state.

Packref v1 assumes a single writer. It does not lock project state, global configuration, or global
store entries against concurrent Packref processes.

## Source layout

```text
src/
  commands/       CLI command definitions
  terminal/       prompts, logs, spinners, titles, and cancellation
  lib/
    core/         identities, sources, errors, registry contracts
    logic/        deterministic parsing, selection, validation, and state transitions
    manifests/    project dependency adapters
    references/   command-aligned domain workflows
    registries/   package registry adapters
    shared/       cross-cutting helpers: JSON and paths
    sources/      repository and tarball fetchers and their external adapters
    store/        global snapshot storage
    workspace/    project and user-level state
  index.ts        composition root and runtime boundary
```
