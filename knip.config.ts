import type { KnipConfig } from "knip"
import analyze from "adamantite/analyze"

const config = {
  ...analyze,
  ignore: [],
  ignoreDependencies: ["@effect/platform-node-shared"],
  ignoreFiles: [],
  project: ["src/**/*.ts"],
} satisfies KnipConfig

export default config
