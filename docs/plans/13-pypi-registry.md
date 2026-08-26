# Plan 13: PyPI Registry Adapter

## Goal

Support `packref add pypi:<name>[@version]` so Python packages get versioned source references,
preferring repository snapshots with the sdist as fallback, and add a Python manifest adapter so
versionless `add` and `sync` work in Python projects.

## Status

Not started. Depends on Plan 10.

## Scope

- Accept the `pypi:` registry prefix.
- Resolve versions using PEP 440 semantics (not semver): version parsing, ordering, and
  specifier matching (`==`, `>=`, `~=`, etc.). Evaluate a small dependency vs. a minimal
  in-repo implementation for the subset packref needs.
- Normalize package names per PEP 503 (case, `-`/`_`/`.` folding) for identity and store paths.
- Discover repository URLs from PyPI metadata `project_urls` (Source/Repository/Homepage
  heuristics) for the repository-first flow.
- Fall back to the sdist (`.tar.gz`) under existing fallback rules; skip wheels (`.whl` zips)
  in this plan. A version with no sdist and no fetchable repository fails with an actionable
  error.
- New manifest adapter `src/lib/manifests/python.ts`: detect `pyproject.toml`, read
  `[project.dependencies]` and `[project.optional-dependencies]`, resolve exact installed
  versions from lockfiles (`uv.lock` first; others as follow-ups) with registry fallback.

## Implementation Steps

1. Verify the PyPI JSON API during implementation (`https://pypi.org/pypi/<name>/json` and the
   per-version variant): metadata shape, `urls` entries for sdists, `project_urls` keys.
2. Add `"pypi"` to `SUPPORTED_REGISTRIES`; confirm spec parsing for `pypi:requests@2.32.0`.
3. Implement PEP 440 version handling in the adapter (`versions.ts`) with thorough unit tests
   (pre/post/dev releases, epochs, `~=`).
4. Implement `src/lib/registries/pypi/` (`client.ts`, `metadata.ts`, `resolver.ts`,
   `versions.ts`) with `defineRegistry`; return identity + repository candidate + sdist URL as
   the archive URL.
5. Register the adapter in `registryAdapters`.
6. Implement `src/lib/manifests/python.ts` with `defineManifest` (TOML parsing — pick a small
   TOML parser or use Bun's built-in support) and register it in `manifestAdapters`.
7. Unit tests with mocked HTTP; integration test against a small real PyPI package.
8. Update README and the init-generated AGENTS.md section; add a minor changeset.

## Acceptance Criteria

- `packref add pypi:requests` resolves the installed version in a uv project, or latest
  otherwise, and materializes a reference with `registry: "pypi"`.
- PEP 440 resolution picks correct versions for range specifiers and never treats versions as
  semver.
- Name normalization means `packref add pypi:Django` and `pypi:django` resolve to one identity.
- Python projects get manifest multiselect in bare `packref add`, and `sync` reconciles
  dependency-tracked PyPI entries.
- `pnpm run check` and `pnpm run test` pass.

## Validation

```sh
pnpm run format
pnpm run check
pnpm run test
```

## Out Of Scope

- Wheel extraction.
- `requirements.txt`, `poetry.lock`, `Pipfile.lock` resolution (follow-up candidates).
- Conda or non-PyPI Python indexes.
