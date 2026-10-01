import core, { ignorePatterns } from "adamantite/lint"
import antislop from "adamantite/lint/antislop"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core, antislop],
  ignorePatterns: [...ignorePatterns],
  options: {
    respectEslintDisableDirectives: true,
    typeAware: true,
    typeCheck: true,
  },
  overrides: [
    // Each `src/lib` folder imports only the folders in lower layers. See the layers in
    // `docs/architecture.md`. `references` is the top layer and may import every other folder.
    {
      files: ["src/lib/**/*.ts"],
      rules: {
        "import/no-relative-parent-imports": "error",
      },
    },
    {
      files: ["src/lib/core/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "#lib/layout/**",
                  "#lib/manifests/**",
                  "#lib/references/**",
                  "#lib/registries/**",
                  "#lib/shared/**",
                  "#lib/sources/**",
                  "#lib/store/**",
                  "#lib/workspace/**",
                ],
                message: "core must not import other lib folders.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/lib/shared/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "#lib/core/**",
                  "#lib/layout/**",
                  "#lib/manifests/**",
                  "#lib/references/**",
                  "#lib/registries/**",
                  "#lib/sources/**",
                  "#lib/store/**",
                  "#lib/workspace/**",
                ],
                message: "shared must not import other lib folders.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/lib/layout/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "#lib/manifests/**",
                  "#lib/references/**",
                  "#lib/registries/**",
                  "#lib/shared/**",
                  "#lib/sources/**",
                  "#lib/store/**",
                  "#lib/workspace/**",
                ],
                message: "layout may import only core.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/lib/manifests/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "#lib/layout/**",
                  "#lib/references/**",
                  "#lib/registries/**",
                  "#lib/shared/**",
                  "#lib/sources/**",
                  "#lib/store/**",
                  "#lib/workspace/**",
                ],
                message: "manifests may import only core.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/lib/registries/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "#lib/layout/**",
                  "#lib/manifests/**",
                  "#lib/references/**",
                  "#lib/shared/**",
                  "#lib/sources/**",
                  "#lib/store/**",
                  "#lib/workspace/**",
                ],
                message: "registries may import only core.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/lib/store/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "#lib/manifests/**",
                  "#lib/references/**",
                  "#lib/registries/**",
                  "#lib/sources/**",
                  "#lib/workspace/**",
                ],
                message: "store may import only core, layout, shared.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/lib/workspace/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "#lib/manifests/**",
                  "#lib/references/**",
                  "#lib/registries/**",
                  "#lib/sources/**",
                  "#lib/store/**",
                ],
                message: "workspace may import only core, layout, shared.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/lib/sources/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "#lib/layout/**",
                  "#lib/manifests/**",
                  "#lib/references/**",
                  "#lib/registries/**",
                  "#lib/workspace/**",
                ],
                message: "sources may import only core, shared, store.",
              },
            ],
          },
        ],
      },
    },
    {
      // Tests compose layers from several folders to build their fixtures.
      files: ["src/lib/**/__tests__/**/*.ts"],
      rules: {
        "import/no-relative-parent-imports": "off",
        "no-restricted-imports": "off",
      },
    },
  ],
  rules: {
    // Also report cycles that pass through type-only imports.
    "import/no-cycle": ["error", { ignoreTypes: false }],
    // Effect combinators such as `Option.some(value)`, `Option.flatMap(fn)`, and
    // `Effect.map(effect, fn)` are indistinguishable from array iteration methods
    // to these array-specific rules.
    "unicorn/no-array-callback-reference": "off",
    "unicorn/no-array-method-this-argument": "off",
  },
})
