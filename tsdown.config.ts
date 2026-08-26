import { defineConfig } from "tsdown"
import { Macros } from "unplugin-macros"

export default defineConfig({
  clean: true,
  deps: {
    neverBundle: true,
  },
  dts: false,
  entry: ["src/index.ts"],
  fixedExtension: false,
  minify: true,
  outDir: "dist",
  platform: "node",
  plugins: [Macros.rolldown()],
  sourcemap: false,
})
