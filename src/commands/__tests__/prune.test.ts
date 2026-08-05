import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { exists, makeCommandTestContext, repositoryEntry } from "#commands/__tests__/helpers.ts"

const context = makeCommandTestContext("packref-prune-command-test-")

const writeGlobalConfig = async (homePath: string, projects: readonly string[]) => {
  const globalDirectoryPath = join(homePath, ".agents", "packref")
  await mkdir(globalDirectoryPath, { recursive: true })
  await writeFile(
    join(globalDirectoryPath, "config.json"),
    `${JSON.stringify({ projects }, null, 2)}\n`
  )
}

const materializeStoreEntry = async (homePath: string) => {
  const entry = repositoryEntry("zod", "4.0.0")
  const entryPath = join(
    homePath,
    ".agents",
    "packref",
    "store",
    "packages",
    entry.registry,
    entry.name,
    entry.version
  )
  await mkdir(entryPath, { recursive: true })
  await writeFile(join(entryPath, "SOURCE.md"), "source")
  return entryPath
}

afterEach(context.cleanup)

describe("prune command", () => {
  it("reports deleted store entries", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    await writeGlobalConfig(homePath, [])
    const entryPath = await materializeStoreEntry(homePath)

    const result = await context.runCli({
      args: ["prune"],
      homePath,
      projectPath,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Removed npm:zod@4.0.0")
    expect(result.output).toContain("Pruned 1 global store entry")
    expect(await exists(entryPath)).toBe(false)
  })

  it("asks before removing stale project registrations", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const staleProjectPath = join(homePath, "missing-project")
    await writeGlobalConfig(homePath, [staleProjectPath])

    const result = await context.runCli({
      args: ["prune"],
      homePath,
      input: "y\r",
      projectPath,
      prompt: "Remove 1 stale project registration?",
    })
    const config = JSON.parse(
      await readFile(join(homePath, ".agents", "packref", "config.json"), "utf8")
    )

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(`Registered project at ${staleProjectPath} no longer exists.`)
    expect(result.output).toContain("Removed 1 stale project registration")
    expect(config.projects).toEqual([])
  })

  it("keeps stale project registrations when declined", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const staleProjectPath = join(homePath, "missing-project")
    await writeGlobalConfig(homePath, [staleProjectPath])
    const entryPath = await materializeStoreEntry(homePath)

    const result = await context.runCli({
      args: ["prune"],
      homePath,
      input: "n\r",
      projectPath,
      prompt: "Remove 1 stale project registration?",
    })
    const config = JSON.parse(
      await readFile(join(homePath, ".agents", "packref", "config.json"), "utf8")
    )

    expect(result.exitCode).toBe(0)
    expect(result.output).not.toContain("Removed 1 stale project registration")
    expect(result.output).toContain(
      "Skipped pruning global store entries because not all registered projects could be inspected"
    )
    expect(config.projects).toEqual([staleProjectPath])
    expect(await exists(entryPath)).toBe(true)
  })

  it("reports when unreadable project lockfiles prevent store pruning", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const registeredProjectPath = await context.makeTempDirectory()
    await writeGlobalConfig(homePath, [registeredProjectPath])
    const entryPath = await materializeStoreEntry(homePath)

    const result = await context.runCli({
      args: ["prune"],
      homePath,
      projectPath,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(
      "Skipped pruning global store entries because not all registered projects could be inspected"
    )
    expect(await exists(entryPath)).toBe(true)
  })
})
