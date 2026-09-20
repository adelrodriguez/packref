---
"packref": patch
---

Use `npx -y packref` in the generated agent guidance

The AGENTS.md guidance template written by `packref init`, the Packref agent skill, and the README now show every command as `npx -y packref <command>`. `-y` skips the npx install confirmation prompt, so commands do not wait for input.

Effect is updated to `4.0.0-rc.116`.
