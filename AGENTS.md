# AGENTS.md

Use ASD-STE100 Simplified Technical English for all communication.

Before you explore or change code, read the relevant `CONTEXT.md` files. Use the
ubiquitous language in these files.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as GitHub issues at `adelrodriguez/packref`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context domain-doc layout. See `docs/agents/domain.md`.

### Changesets

Use Changesets for versioning and changelog management. See `docs/agents/changesets.md`.

## Testing

- `pnpm run test` runs the `unit` Vitest project. It must pass without network access.
- Put each test that uses the network in a `*.integration.test.ts` file. The `integration` project in `vitest.config.ts` selects these files by that pattern, and the `unit` project excludes them. `pnpm run test:integration` runs them.
- A network test in a file without the pattern runs in the `unit` project. This makes the unit CI job depend on the registry, and the test only fails offline. Rename the file to correct this.
- The reflink tests in `src/lib/workspace/__tests__/reflinker.test.ts` are hermetic, not integration tests. They probe the filesystem and skip where copy-on-write cloning is unsupported.

<!-- PACKREF:START -->

## Packref

Use Packref when you need to inspect a dependency's exact source implementation or compare referenced versions; read the local `packref` skill, or install it with `npx -y skills add https://github.com/adelrodriguez/packref/tree/v0.3.2 --skill packref`.
Run `remove`, `prune`, `clean`, or `clean --global` only when the user requests that removal scope, because these commands delete state.

<!-- PACKREF:END -->

<!-- ADAMANTITE:START -->

## Adamantite

This project uses Adamantite for its managed formatting, linting, type checking, and dependency-analysis setup.

- Prefer the package scripts Adamantite added for this workspace.
- Run `pnpm run check` to catch lint and type issues. Direct command: `adamantite check`.
- Run `pnpm run fix` after editing files to apply formatting and safe lint fixes. Direct command: `adamantite fix`.
- Run `pnpm run analyze` after changing dependencies, imports, or exports. Direct command: `adamantite analyze`.
- Use `adamantite doctor` to inspect managed setup and `adamantite doctor --fix` for safe local fixes.

<!-- ADAMANTITE:END -->
