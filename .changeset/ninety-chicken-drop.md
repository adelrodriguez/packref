---
"packref": patch
---

Fix internal "Help requested" message leaking into output for empty or invalid CLI input, while keeping exit codes correct (0 for missing arguments, 1 for unknown subcommands)
