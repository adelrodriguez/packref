import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { exists, initializeProject, makeCommandTestContext } from "#commands/__tests__/helpers.ts"

const context = makeCommandTestContext("packref-add-command-integration-test-")

afterEach(context.cleanup)

describe("add command with the npm registry", () => {
  it("adds a selected manifest dependency when no package is provided", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    await writeFile(
      join(projectPath, "package.json"),
      JSON.stringify({ dependencies: { lsb32: "0.2.0" } })
    )
    await initializeProject(projectPath, [])

    const result = await context.runCli({
      args: ["add"],
      homePath,
      input: " \r",
      projectPath,
      prompt: "Select packages to add",
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Added npm:lsb32@0.2.0")
    expect(await exists(join(projectPath, ".packref", "packages", "npm", "lsb32", "0.2.0"))).toBe(
      true
    )
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )
    expect(lockfile.packages).toHaveLength(1)
    expect(lockfile.packages[0]).toMatchObject({
      name: "lsb32",
      registry: "npm",
      tracking: "dependency",
      version: "0.2.0",
    })
  }, 180_000)
})
