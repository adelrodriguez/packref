---
"packref": patch
---

Use `npx -y packref` in the generated agent guidance

The AGENTS.md guidance template written by `packref init`, the Packref agent skill, and the README now show every command as `npx -y packref <command>`. The template also warns that `pnpm dlx packref` fails when pnpm blocks dependency build scripts.

Effect is updated to `4.0.0-rc.116`.
