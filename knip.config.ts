import type { KnipConfig } from "knip"
import analyze, { ignoreDependencies } from "adamantite/analyze"

const config = {
  ...analyze,
  ignore: [],
  // `adamantite prepare` runs `@effect/tsgo`, which Knip does not detect.
  // The shared platform dependency pins the transitive runtime version.
  ignoreDependencies: [
    ...ignoreDependencies.effect,
    "@effect/platform-node-shared",
    "@effect/tsgo",
  ],
  ignoreFiles: [],
  project: ["src/**/*.ts"],
} satisfies KnipConfig

export default config
