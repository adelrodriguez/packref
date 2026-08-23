---
"packref": patch
---

Improve the Packref agent skill's package inspection workflow

The skill now identifies the exact package identity and local source path before inspection. It also distinguishes source restoration from commands that change or remove project state, documents `init --non-interactive` for agents, and covers direct repository specs for `add`.

The AGENTS.md guidance template written by `packref init` now notes that `sync` can remove references and that destructive commands require a user request.
