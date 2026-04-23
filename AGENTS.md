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

## Changesets

- We use `changesets` for versioning and changelog management.
- Run `bun changeset --empty` to create a new empty changeset file.
- Never make a major version bump unless the user requests it.
- If a breaking change is being made, and we are on v1.0.0 or higher, alert the user.
- Do not create a changeset if we are still in 0.0.0, as we are still in pre-release and no package has been published yet.
