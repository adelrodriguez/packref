# AGENTS.md

This project was built with [`pastry`](https://github.com/adelrodriguez/pastry) template.

## Project Context

- Product and behavior reference: `.plans/packref-v1-spec.md`
- Architecture and implementation reference: `.plans/implementation-strategy.md`
- Actionable implementation plans live in `.plans/`

## Quality Control

- We use `adamantite` for linting, formatting and type checking.
- Always run `bun run format` after editing files.
- After making changes, run `bun run check` and `bun run test` to ensure the code is still valid.
- After installing or removing dependencies, run `bun run analyze` to ensure we are not using any dependencies that are not needed.

## Effect

- When writing an Effect function, yield all service dependencies inside that function instead of resolving them outside and passing them in.

## Changesets

- We use `changesets` for versioning and changelog management.
- Run `bun changeset --empty` to create a new empty changeset file.
- Never make a major version bump unless the user requests it.
- If a breaking change is being made, and we are on v1.0.0 or higher, alert the user.
- Do not create a changeset if we are still in 0.0.0, as we are still in pre-release and no package has been published yet.

<!-- PACKREF:START -->

## Packref

Packref provides local copies of dependency source code so you can inspect the exact implementation used by this project.

- Source references are stored in `.packref/packages/<registry>/<package>/<version>/` for unscoped packages and `.packref/packages/<registry>/<scope>/<package>/<version>/` for scoped packages — browse these directories to read dependency internals
- `.packref/` is developer-local and git-ignored; run `packref init` to set up, then `packref add <package>` to fetch references
- Available commands:
  - `packref add <package>` — fetch source for a package (e.g. `packref add react`, `packref add hono@4.2.0`, `packref add @effect/cli`)
  - `packref remove <package>` — remove a package reference
  - `packref sync` — update references to match current `package.json` dependency versions
  - `packref list` — show all referenced packages
  - `packref prune` — remove unused entries from the global store
  - `packref clean` — wipe all global store entries
- Use Packref when you need to understand how a dependency works internally — read the source in `.packref/` instead of guessing or searching the web
- Multiple versions of the same package can coexist; check `.packref/packref-lock.json` for the full list
<!-- PACKREF:END -->
