---
"packref": patch
---

Install fewer dependencies: `semver`, `jsonc-parser`, `nanotar`, `nypm`, `@clack/prompts`, and `picocolors` are replaced by Effect and Node.js built-ins

Packref now unpacks a package tarball while it downloads, instead of after the whole archive arrives.
