---
"packref": patch
---

Fix `packref sync` in monorepos that have private workspace packages with no `version` field. Packref does not show a manifest parse error for these packages now. Packref also does not read `node_modules` for `link:`, `file:`, and `portal:` dependencies.
