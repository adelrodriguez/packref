---
"packref": minor
---

Reject repeated single-value flags such as `--ignore --ignore`

Packref now fails with `Invalid value for flag --ignore: "2 occurrences"` when a command receives the same flag twice. Before, it ignored the extra occurrence. To migrate, pass each flag once in scripts that call Packref.
