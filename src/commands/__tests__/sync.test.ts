import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  initializeProject,
  makeCommandTestContext,
  materializeReference,
  repositoryEntry,
} from "#commands/__tests__/helpers.ts"

const context = makeCommandTestContext("packref-sync-command-test-")

afterEach(context.cleanup)

describe("sync command", () => {
  it("reports dependency-tracked references that are already up to date", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const entry = repositoryEntry("example", "1.0.0", "dependency")

    await initializeProject(projectPath, [entry])
    await materializeReference(projectPath, entry)
    await writeFile(
      join(projectPath, "package.json"),
      JSON.stringify({ dependencies: { example: "^1.0.0" } })
    )
    await mkdir(join(projectPath, "node_modules", "example"), { recursive: true })
    await writeFile(
      join(projectPath, "node_modules", "example", "package.json"),
      JSON.stringify({ version: "1.0.0" })
    )

    const result = await context.runCli({
      args: ["sync"],
      homePath,
      projectPath,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("All dependency-tracked references are up to date.")
    expect(result.output).toContain("Package references already synchronized")
  })

  it("removes stale dependency entries and preserves manual references", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const staleEntry = repositoryEntry("stale", "1.0.0", "dependency")
    const manualEntry = repositoryEntry("manual", "2.0.0", "manual")

    await initializeProject(projectPath, [staleEntry, manualEntry])
    await writeFile(join(projectPath, "package.json"), JSON.stringify({ dependencies: {} }))
    await materializeReference(projectPath, staleEntry)
    await materializeReference(projectPath, manualEntry)

    const result = await context.runCli({
      args: ["sync"],
      homePath,
      projectPath,
    })
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("The following package references will be removed:")
    expect(result.output).toContain("npm:stale@1.0.0")
    expect(result.output).toContain("Removed npm:stale@1.0.0")
    expect(result.output).toContain("Synchronized 1 package reference")
    expect(lockfile.packages).toEqual([manualEntry])
  })

  it("ignores unreferenced manifest dependencies without prompting", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()

    await initializeProject(projectPath, [])
    await writeFile(
      join(projectPath, "package.json"),
      JSON.stringify({ dependencies: { example: "^1.0.0" } })
    )

    const result = await context.runCli({
      args: ["sync"],
      homePath,
      projectPath,
    })
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )

    expect(result.exitCode).toBe(0)
    expect(result.output).not.toContain("Select unreferenced dependencies to add")
    expect(result.output).toContain("No dependency-tracked references to update.")
    expect(lockfile.packages).toEqual([])
  })

  it("previews current and target versions before applying an update", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const oldEntry = repositoryEntry("example", "1.0.0", "dependency")
    const targetEntry = repositoryEntry("example", "2.0.0", "dependency")

    await initializeProject(projectPath, [oldEntry, targetEntry])
    await writeFile(
      join(projectPath, "package.json"),
      JSON.stringify({ dependencies: { example: "^2.0.0" } })
    )
    await mkdir(join(projectPath, "node_modules", "example"), { recursive: true })
    await writeFile(
      join(projectPath, "node_modules", "example", "package.json"),
      JSON.stringify({ version: "2.0.0" })
    )
    await materializeReference(projectPath, oldEntry)
    await materializeReference(projectPath, targetEntry)

    const result = await context.runCli({
      args: ["sync"],
      homePath,
      projectPath,
    })
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )
    const previewIndex = result.output.indexOf("npm:example 1.0.0 → 2.0.0")
    const appliedIndex = result.output.indexOf("Updated npm:example@2.0.0")

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("The following package references will be updated:")
    expect(previewIndex).toBeGreaterThan(-1)
    expect(appliedIndex).toBeGreaterThan(previewIndex)
    expect(lockfile.packages).toEqual([targetEntry])
  })

  it("reports an actionable error for unsupported projects", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()

    await initializeProject(projectPath, [])

    const result = await context.runCli({
      args: ["sync"],
      homePath,
      projectPath,
    })

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("No supported project manifest was found")
  })
})
