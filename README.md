<div align="center">
  <h1 align="center">packref</h1>

  <p align="center">
    <strong>Local, versioned package references for your agents</strong>
  </p>
</div>

Made with [🥐 `pastry`](https://github.com/adelrodriguez/pastry)

## Quick start

Packref gives coding agents local, versioned copies of dependency source code. It installs source
references for inspection; it does not install your project's runtime dependencies.

```sh
packref init
packref add react
packref add hono@4.2.0
```

Commit `.packref/packref-lock.json` with the project. Packref ignores the generated
`.packref/packages/` trees and temporary lockfile writes.

After cloning a project with a Packref lockfile, restore its references with:

```sh
packref install
```

`install` follows the committed lockfile exactly and never changes it. Use `packref sync` when you
want dependency-tracked references and lock entries updated to match the versions installed by the
project's package manager.

## Storage

- `.packref/packref-lock.json` — committed identities, source metadata, and tracking modes.
- `.packref/packages/` — ignored project-local source trees used by agents.
- `~/.agents/packref/store/` — deduplicated global source snapshots.
- `~/.agents/packref/config.json` — registered project paths used by pruning.

Repository snapshots are preferred when package metadata provides a supported host and matching
version tag. Packref falls back to the published npm tarball when repository metadata, host support,
or a matching tag is unavailable.

Use `packref list` to inspect references, `packref remove` to remove selected references,
`packref clean` to clear the current project, `packref prune` to remove unused global entries, and
`packref clean --global` to wipe the global store.

## Agent skill

Install the first-party Packref skill to teach coding agents how to locate and inspect the exact
dependency source recorded for a project:

```sh
npx skills add adelrodriguez/packref --list
npx skills add adelrodriguez/packref --skill packref
```

See the [`packref` skill on skills.sh](https://skills.sh/adelrodriguez/packref/packref).
