import core from "adamantite/lint"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core],
  options: {
    respectEslintDisableDirectives: true,
    typeAware: true,
    typeCheck: true,
  },
  overrides: [
    {
      excludeFiles: ["**/__tests__/**"],
      files: ["src/lib/core/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "#commands/**",
                  "#lib/logic/**",
                  "#lib/manifests/**",
                  "#lib/references/**",
                  "#lib/registries/**",
                  "#lib/shared/**",
                  "#lib/sources/**",
                  "#lib/store/**",
                  "#lib/workspace/**",
                  "#terminal/**",
                  "node:*",
                  "@clack/**",
                  "@effect/platform-*/**",
                ],
                message: "Core models must not depend on logic, orchestration, or I/O adapters.",
              },
            ],
          },
        ],
      },
    },
    {
      excludeFiles: ["**/__tests__/**"],
      files: ["src/lib/logic/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "#commands/**",
                  "#lib/manifests/**",
                  "#lib/references/**",
                  "#lib/registries/**",
                  "#lib/shared/**",
                  "#lib/sources/**",
                  "#lib/store/**",
                  "#lib/workspace/**",
                  "#terminal/**",
                  "node:*",
                  "@clack/**",
                  "@effect/platform-*/**",
                  "effect/FileSystem",
                  "effect/Terminal",
                  "effect/unstable/http/**",
                  "effect/unstable/process/**",
                ],
                message:
                  "Deterministic logic may import core models, not I/O adapters or orchestrators.",
              },
            ],
          },
        ],
      },
    },
    {
      excludeFiles: ["**/__tests__/**"],
      files: [
        "src/lib/manifests/**/*.ts",
        "src/lib/registries/**/*.ts",
        "src/lib/shared/**/*.ts",
        "src/lib/sources/**/*.ts",
        "src/lib/store/**/*.ts",
        "src/lib/workspace/**/*.ts",
        "src/terminal/**/*.ts",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["#commands/**", "#lib/references/**"],
                message: "I/O adapters must not depend on commands or orchestrators.",
              },
            ],
          },
        ],
      },
    },
    {
      excludeFiles: ["**/__tests__/**"],
      files: ["src/lib/references/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["#commands/**", "#terminal/**"],
                message: "Orchestrators must remain independent of CLI and terminal adapters.",
              },
            ],
          },
        ],
      },
    },
  ],
  rules: {
    // Effect combinators such as `Option.some(value)`, `Option.flatMap(fn)`, and
    // `Effect.map(effect, fn)` are indistinguishable from array iteration methods
    // to these array-specific rules.
    "unicorn/no-array-callback-reference": "off",
    "unicorn/no-array-method-this-argument": "off",
  },
})
