import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  initializeProject,
  makeCommandTestContext,
  repositoryEntry,
} from "#commands/__tests__/helpers.ts"

const context = makeCommandTestContext("packref-add-command-test-")

afterEach(context.cleanup)

describe("add", () => {
  it("shows unreferenced manifest dependencies when no package is provided", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    await writeFile(
      join(projectPath, "package.json"),
      JSON.stringify({
        dependencies: { react: "19.0.0", zod: "4.0.0" },
        devDependencies: { typescript: "7.0.2" },
      })
    )
    await initializeProject(projectPath, [repositoryEntry("react", "19.0.0", "dependency")])

    const result = await context.runCli({
      args: ["add"],
      homePath,
      input: "\r",
      projectPath,
      prompt: "Select packages to add",
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Select packages to add")
    expect(result.output).not.toContain("npm:react")
    expect(result.output).toContain("npm:typescript")
    expect(result.output).toContain("npm:zod")
    expect(result.output).toContain("No package references added")
  })

  it("gracefully handles package selection cancellation", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    await writeFile(
      join(projectPath, "package.json"),
      JSON.stringify({ dependencies: { react: "19.0.0" } })
    )
    await initializeProject(projectPath, [])

    const result = await context.runCli({
      args: ["add"],
      homePath,
      input: "\u0003",
      projectPath,
      prompt: "Select packages to add",
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("You've cancelled the package addition process.")
    expect(result.output).not.toContain("Operation cancelled")
    expect(result.output).not.toContain("No package references added")
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )
    expect(lockfile).toEqual({ packages: [] })
  })

  it("prints a helpful message when bare add has no candidates", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    await writeFile(join(projectPath, "package.json"), JSON.stringify({ dependencies: {} }))
    await initializeProject(projectPath, [])

    const result = await context.runCli({ args: ["add"], homePath, projectPath })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("No project dependencies are available to add.")
  })
})
