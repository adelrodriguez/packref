import type { KnipConfig } from "knip"
import analyze from "adamantite/analyze"

const config = {
  ...analyze,
  ignore: [],
  // Pinned so that npm installs the platform-node-shared version that matches the pinned
  // effect version. The range in @effect/platform-node would otherwise resolve a newer
  // release that requires a newer, incompatible effect.
  ignoreDependencies: ["@effect/platform-node-shared"],
  ignoreFiles: [],
  project: ["src/**/*.ts"],
} satisfies KnipConfig

export default config
