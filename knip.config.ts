import type { KnipConfig } from "knip"
import analyze, { ignoreDependencies } from "adamantite/analyze"

const config = {
  ...analyze,
  ignore: [],
  // Adamantite runs `@effect/tsgo` for its Effect checks, which Knip does not detect.
  ignoreDependencies: [...ignoreDependencies.effect, "@effect/tsgo"],
  ignoreFiles: [],
  project: ["src/**/*.ts"],
} satisfies KnipConfig

export default config
