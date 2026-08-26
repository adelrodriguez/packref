import { Macros } from "unplugin-macros"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [Macros.vite()],
  test: {
    coverage: {
      provider: "v8",
    },
    projects: [
      {
        extends: true,
        test: {
          exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
          include: ["src/**/*.test.ts"],
          name: "unit",
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.integration.test.ts"],
          name: "integration",
        },
      },
    ],
  },
})
