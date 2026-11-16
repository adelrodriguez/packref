---
"packref": patch
---

Install fewer dependencies: `semver`, `jsonc-parser`, `nanotar`, `giget`, `nypm`, `@clack/prompts`, and `picocolors` are replaced by Effect and Node.js built-ins

Packref now unpacks a package tarball or repository archive while it downloads, instead of after the whole archive arrives. A repository snapshot leaves out symlinks, because a symlink can point outside the repository. Repository downloads no longer read the `GIGET_AUTH` token or keep archives in `~/.cache/giget`. The global store already keeps each snapshot.
