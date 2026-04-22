import type { KnipConfig } from "knip"
import analyze from "adamantite/analyze"

const config: KnipConfig = {
  ...analyze,
  ignore: [],
  ignoreExportsUsedInFile: true,
  ignoreFiles: [],
  project: ["src/**/*.ts"],
  rules: {
    ...analyze.rules,
    binaries: "error",
    dependencies: "error",
    devDependencies: "off",
    duplicates: "warn",
    enumMembers: "off",
    exports: "warn",
    files: "error",
    nsExports: "warn",
    nsTypes: "warn",
    optionalPeerDependencies: "warn",
    types: "warn",
    unlisted: "error",
    unresolved: "error",
  },
}

export default config
