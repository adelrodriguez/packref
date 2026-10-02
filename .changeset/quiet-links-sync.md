---
"packref": patch
---

Fix `packref sync` in monorepos that have private workspace packages with no `version` field. Packref does not show a manifest parse error for these packages now. Packref also stops at the nearest installed package, and does not use a version from a different package with the same name in a parent `node_modules`.
