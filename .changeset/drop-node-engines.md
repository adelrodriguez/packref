---
"packref": patch
---

Remove Packref's own `engines.node` declaration, so Packref itself no longer causes npm engine warnings or failures. Dependency engine checks still apply. The README now says that Packref supports Node.js 22.19 or later, which the current dependencies require.
