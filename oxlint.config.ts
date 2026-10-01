import core, { ignorePatterns } from "adamantite/lint"
import antislop from "adamantite/lint/antislop"
import { defineConfig, type OxlintOverride } from "oxlint"

// Each `src/lib` folder lists the folders it may import, so dependencies point in a single
// direction. See the layers in `docs/architecture.md`.
const LIB_LAYERS = {
  core: [],
  layout: ["core"],
  manifests: ["core"],
  references: [
    "core",
    "layout",
    "manifests",
    "registries",
    "shared",
    "sources",
    "store",
    "workspace",
  ],
  registries: ["core"],
  shared: [],
  sources: ["core", "shared", "store"],
  store: ["core", "layout", "shared"],
  workspace: ["core", "layout", "shared"],
} satisfies Record<string, readonly string[]>

const libFolders = Object.keys(LIB_LAYERS)

const libLayerOverrides = Object.entries(LIB_LAYERS).map(
  ([folder, allowed]: [string, readonly string[]]): OxlintOverride => ({
    files: [`src/lib/${folder}/**/*.ts`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: libFolders
                .filter((target) => target !== folder && !allowed.includes(target))
                .map((target) => `#lib/${target}/**`),
              message: `${folder} may import only ${[folder, ...allowed].join(", ")}.`,
            },
            {
              group: ["./**", "../**"],
              message: "Use a #lib import so the layer rules apply.",
            },
          ],
        },
      ],
    },
  })
)

export default defineConfig({
  extends: [core, antislop],
  ignorePatterns: [...ignorePatterns],
  options: {
    respectEslintDisableDirectives: true,
    typeAware: true,
    typeCheck: true,
  },
  overrides: [
    ...libLayerOverrides,
    {
      // Tests compose layers from several folders to build their fixtures.
      files: ["src/lib/**/__tests__/**/*.ts"],
      rules: {
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
