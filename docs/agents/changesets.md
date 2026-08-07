# Changesets

This repository uses Changesets for versioning and changelog management.

## Agent rules

- Include a changeset with every user-facing change.
- Run `bun changeset --empty` to create a new empty changeset file.
- Never make a major version bump unless the user requests it.
- If a change is breaking and the current package version is 1.0.0 or higher, alert the user.
