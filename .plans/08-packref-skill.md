# Plan 08: Publishable Packref Agent Skill

## Goal

Create a first-party `packref` agent skill in this repository and make it discoverable on
[skills.sh](https://www.skills.sh/). The skill should teach coding agents to fetch and inspect the
exact dependency source used by a project instead of guessing from public documentation, relying
on a different installed version, or cloning an unrelated repository revision.

The skill is guidance for using the Packref CLI, not a replacement for the CLI. Keep it concise,
portable across agents, and synchronized with Packref's released behavior.

## User Experience

Users can inspect and install the skill from the Packref repository:

```sh
npx skills add adelrodriguez/packref --list
npx skills add adelrodriguez/packref --skill packref
```

Once installed, the skill should activate for requests such as:

- inspect how a dependency implements a particular behavior;
- debug an integration against the exact installed dependency version;
- compare source for two dependency versions already referenced by Packref;
- fetch a package reference before making a claim about dependency internals;
- follow a dependency's code path from its public API into its implementation.

## Skill Scope and Behavior

The skill should direct an agent to:

1. Detect whether the current project has Packref initialized and whether the requested package
   already has a local reference.
2. Prefer existing references under `.packref/packages/` and use `.packref/packref-lock.json` to
   identify the registry, exact version, source, tracking mode, and coexistence of multiple
   versions.
3. Use `packref list` to orient before fetching or removing anything.
4. Use the Packref command that matches the task:
   - `packref init` to initialize Packref when the user has authorized project setup;
   - `packref add [package]` to resolve and materialize a missing reference;
   - `packref sync` to reconcile dependency-tracked references after manifest or lockfile changes;
   - `packref remove [package]` only when removal is explicitly requested;
   - `packref prune` and `packref clean` only when their destructive scope is explicitly requested;
   - `packref install` after cloning when Plan 07 has shipped and the command is part of the
     supported public CLI.
5. Search and read the materialized source with local filesystem tools, citing relevant project
   paths and distinguishing verified implementation facts from inference.
6. Fall back to registry metadata or web research only when the required source cannot be
   materialized, and report that limitation clearly.

Do not teach unpublished commands as current behavior. If the skill is implemented before
`packref install` ships, omit that command and add it in a later skill update.

## Repository Layout

Use a standard skills.sh discovery location:

```text
skills/
└── packref/
    ├── SKILL.md
    └── agents/
        └── openai.yaml
```

- Keep `SKILL.md` as the canonical, cross-agent instruction set.
- Include only `name` and `description` in its YAML frontmatter.
- Make the description specific enough to trigger on dependency-source inspection, exact-version
  debugging, and requests to use Packref.
- Generate `agents/openai.yaml` from the completed skill so its display name, short description,
  and default prompt stay consistent with `SKILL.md`.
- Add `references/`, `scripts/`, or `assets/` only if implementation proves they remove real
  repetition. The initial skill should not duplicate the README or bundle the Packref executable.

## Implementation Steps

1. Verify the public CLI surface, path layout, initialization behavior, and safety boundaries
   against the implementation, tests, and current product documentation. Resolve discrepancies
   before encoding them in the skill.
2. Define representative trigger prompts and non-trigger cases. The skill should trigger when an
   agent needs exact package source, but not for ordinary package installation, generic API usage,
   or unrelated Git repository browsing.
3. Initialize `skills/packref/` with the standard skill scaffold and generated UI metadata.
4. Write a concise `SKILL.md` in imperative form with:
   - a read-first workflow that reuses existing references;
   - command selection and mutation boundaries;
   - exact scoped and unscoped reference paths;
   - multiple-version and monorepo `source.directory` handling;
   - local source-search guidance;
   - failure and fallback behavior;
   - a reminder to follow repository-local `AGENTS.md` instructions.
5. Add focused examples covering an unscoped package, a scoped package, a missing reference, an
   already-materialized reference, and two referenced versions of the same package. Keep examples
   inside `SKILL.md` unless their size justifies a direct, one-level reference file.
6. Generate or regenerate `agents/openai.yaml` after the skill text is final.
7. Validate the skill structure and frontmatter with the skill-creation validator.
8. Forward-test the skill in fresh agent contexts using realistic requests without leaking the
   expected command sequence or answer. Verify both successful behavior and mutation restraint.
9. Add README documentation for installing the skill, link to its eventual skills.sh page, and add
   the skills.sh install-count badge after the repository is indexed.
10. Publish the skill by merging it into the public GitHub repository, then install it once through
    the skills CLI so skills.sh can discover and index it.
11. Verify the indexed page shows the correct repository, `packref` slug, rendered `SKILL.md`,
    install command, and security-audit status. Treat warnings or failures as release blockers
    until reviewed and resolved or explicitly documented.
12. Do not create a changeset while the package remains at `0.0.0`, per repository policy. Revisit
    whether skill-only changes need release notes once Packref has a published versioning baseline.

## Tests

### Static validation

- The skill folder is named `packref` and contains a valid, case-sensitive `SKILL.md`.
- Frontmatter contains a lowercase `name: packref` and a precise `description`.
- `agents/openai.yaml` matches the completed skill.
- Every command and path in the skill matches the supported Packref release.
- The skill contains no stale placeholder files, duplicated documentation, or unnecessary assets.

### Behavioral validation

- With an existing reference, the agent reads it without fetching another copy.
- With a missing reference in an initialized project, the agent selects the appropriate
  non-destructive Packref command and then inspects the materialized source.
- With no Packref setup, the agent explains the required initialization and does not silently
  rewrite project integration files without authorization.
- Scoped packages resolve to `.packref/packages/<registry>/<scope>/<package>/<version>/`.
- Multiple versions are disambiguated through the lockfile rather than by choosing the newest.
- Repository-backed monorepo packages respect locked `source.directory` metadata.
- The agent does not run `remove`, `prune`, or `clean` during a source-inspection task.
- The agent does not claim to have verified source when materialization failed.
- Generic package-manager questions do not spuriously trigger the skill.

### Distribution validation

Run the same flow users will run against the public repository:

```sh
npx skills add adelrodriguez/packref --list
npx skills add adelrodriguez/packref --skill packref -g -a codex -y
```

Confirm the installed files match the repository version, the skill activates in a fresh Codex
task, and `https://skills.sh/adelrodriguez/packref/packref` becomes available after indexing.

## Acceptance Criteria

- The Packref repository contains a valid first-party skill at `skills/packref/SKILL.md`.
- The skills CLI discovers and installs it by the name `packref`.
- The installed skill enables an agent to locate and inspect exact dependency source using Packref
  while respecting initialization and destructive-command boundaries.
- The skill works for scoped packages, multiple versions, and monorepo package directories.
- Its documented commands match the released CLI rather than planned behavior.
- Fresh-context forward tests pass for representative trigger, non-trigger, success, and failure
  cases.
- The skill has a public skills.sh page with correct source attribution and no unresolved security
  audit failures.
- README installation instructions and links are accurate.

## Validation

During implementation, run:

```sh
bun run format
bun run check
bun run test
```

If dependencies are added or removed, also run:

```sh
bun run analyze
```

Before publication, also run the skill validator, fresh-context behavioral tests, and the public
`npx skills add` distribution checks described above.

## Out of Scope

- Reimplementing Packref behavior inside the skill.
- Bundling or automatically installing the Packref CLI.
- Publishing a separate repository solely for the skill.
- Adding new registries, commands, or lockfile features to Packref.
- Teaching agents to clone arbitrary dependency repositories instead of using exact Packref
  references.
- Guaranteeing placement or ranking on the skills.sh leaderboard beyond successful indexing.
