import core from "adamantite/lint"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core],
  options: {
    respectEslintDisableDirectives: true,
    typeAware: true,
    typeCheck: true,
  },
  rules: {
    // Effect combinators such as `Option.some(value)`, `Option.flatMap(fn)`, and
    // `Effect.map(effect, fn)` are indistinguishable from array iteration methods
    // to these array-specific rules.
    "unicorn/no-array-callback-reference": "off",
    "unicorn/no-array-method-this-argument": "off",
  },
})
