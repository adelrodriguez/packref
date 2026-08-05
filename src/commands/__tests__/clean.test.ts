import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  exists,
  initializeProject,
  makeCommandTestContext,
  materializeReference,
  repositoryEntry,
} from "#commands/__tests__/helpers.ts"

const context = makeCommandTestContext("packref-clean-command-test-")
const globalConfirmationPrompt = "Remove all entries from the global Packref store?"
const localConfirmationPrompt = "Remove all package references from this project?"

const writeGlobalConfig = async (homePath: string, projects: readonly string[]) => {
  const configPath = join(homePath, ".agents", "packref", "config.json")
  await mkdir(join(homePath, ".agents", "packref"), { recursive: true })
  const contents = `${JSON.stringify({ projects }, null, 2)}\n`
  await writeFile(configPath, contents)
  return { configPath, contents }
}

const materializeStoreEntry = async (homePath: string, name: string, version: string) => {
  const entryPath = join(homePath, ".agents", "packref", "store", "packages", "npm", name, version)
  await mkdir(entryPath, { recursive: true })
  await writeFile(join(entryPath, "SOURCE.md"), "source")
  return entryPath
}

afterEach(context.cleanup)

describe("clean command", () => {
  it("removes all project references and resets the lockfile", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const react = repositoryEntry("react", "19.0.0")
    const zod = repositoryEntry("zod", "4.0.0")
    await initializeProject(projectPath, [react, zod])
    const reactPath = await materializeReference(projectPath, react)
    const zodPath = await materializeReference(projectPath, zod)

    const result = await context.runCli({
      args: ["clean"],
      homePath,
      input: "y\r",
      projectPath,
      prompt: localConfirmationPrompt,
    })
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Removed 2 project references")
    expect(await exists(reactPath)).toBe(false)
    expect(await exists(zodPath)).toBe(false)
    expect(lockfile).toEqual({ packages: [] })
  })

  it("preserves the global store and project registration during local clean", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const entry = repositoryEntry("zod", "4.0.0")
    await initializeProject(projectPath, [entry])
    await materializeReference(projectPath, entry)
    const storeEntryPath = await materializeStoreEntry(homePath, "zod", "4.0.0")
    const config = await writeGlobalConfig(homePath, [projectPath])

    const result = await context.runCli({
      args: ["clean"],
      homePath,
      input: "y\r",
      projectPath,
      prompt: localConfirmationPrompt,
    })

    expect(result.exitCode).toBe(0)
    expect(await exists(storeEntryPath)).toBe(true)
    expect(await readFile(config.configPath, "utf8")).toBe(config.contents)
  })

  it("removes orphaned project reference data when the lockfile is empty", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    await initializeProject(projectPath, [])
    const partialReferencePath = join(projectPath, ".packref", "packages", ".partial")
    await mkdir(join(projectPath, ".packref", "packages"), { recursive: true })
    await writeFile(partialReferencePath, "partial")

    const result = await context.runCli({
      args: ["clean"],
      homePath,
      input: "y\r",
      projectPath,
      prompt: localConfirmationPrompt,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("No project references found")
    expect(await exists(partialReferencePath)).toBe(false)
  })

  it("removes project references and resets a malformed lockfile", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const entry = repositoryEntry("zod", "4.0.0")
    await initializeProject(projectPath, [entry])
    const referencePath = await materializeReference(projectPath, entry)
    const lockfilePath = join(projectPath, ".packref", "packref-lock.json")
    await writeFile(lockfilePath, "not json")

    const result = await context.runCli({
      args: ["clean"],
      homePath,
      input: "y\r",
      projectPath,
      prompt: localConfirmationPrompt,
    })
    const lockfile = JSON.parse(await readFile(lockfilePath, "utf8"))

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("No project references found")
    expect(await exists(referencePath)).toBe(false)
    expect(lockfile).toEqual({ packages: [] })
  })

  it("requires an initialized project for local clean", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()

    const result = await context.runCli({
      args: ["clean"],
      homePath,
      projectPath,
    })

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("Packref is not initialized")
  })

  it("preserves project references when local confirmation is declined", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const entry = repositoryEntry("zod", "4.0.0")
    await initializeProject(projectPath, [entry])
    const referencePath = await materializeReference(projectPath, entry)

    const result = await context.runCli({
      args: ["clean"],
      homePath,
      input: "n\r",
      projectPath,
      prompt: localConfirmationPrompt,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Project references were not cleaned")
    expect(await exists(referencePath)).toBe(true)
  })

  it("removes and reports all global store entries with --global", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const firstEntryPath = await materializeStoreEntry(homePath, "react", "19.0.0")
    const secondEntryPath = await materializeStoreEntry(homePath, "zod", "4.0.0")
    const partialEntryPath = join(homePath, ".agents", "packref", "store", ".partial")
    await writeFile(partialEntryPath, "partial")

    const result = await context.runCli({
      args: ["clean", "--global"],
      homePath,
      input: "y\r",
      projectPath,
      prompt: globalConfirmationPrompt,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Removed 2 global store entries")
    expect(await exists(firstEntryPath)).toBe(false)
    expect(await exists(secondEntryPath)).toBe(false)
    expect(await exists(partialEntryPath)).toBe(false)
  })

  it("supports -g and works outside an initialized project", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const entryPath = await materializeStoreEntry(homePath, "zod", "4.0.0")

    const result = await context.runCli({
      args: ["clean", "-g"],
      homePath,
      input: "y\r",
      projectPath,
      prompt: globalConfirmationPrompt,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Removed 1 global store entry")
    expect(await exists(entryPath)).toBe(false)
    expect(await exists(join(projectPath, ".packref"))).toBe(false)
  })

  it("wipes the global store when an expected package directory is a file", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const storePath = join(homePath, ".agents", "packref", "store")
    const malformedEntryPath = join(storePath, "packages", "npm", "react")
    await mkdir(join(storePath, "packages", "npm"), { recursive: true })
    await writeFile(malformedEntryPath, "not a directory")

    const result = await context.runCli({
      args: ["clean", "--global"],
      homePath,
      input: "y\r",
      projectPath,
      prompt: globalConfirmationPrompt,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("No global store entries found")
    expect(await exists(storePath)).toBe(false)
  })

  it("preserves global registrations and project references during global clean", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const entry = repositoryEntry("zod", "4.0.0")
    await initializeProject(projectPath, [entry])
    const referencePath = await materializeReference(projectPath, entry)
    const lockfilePath = join(projectPath, ".packref", "packref-lock.json")
    const lockfileContents = await readFile(lockfilePath, "utf8")
    const config = await writeGlobalConfig(homePath, [projectPath])
    await materializeStoreEntry(homePath, "zod", "4.0.0")

    const result = await context.runCli({
      args: ["clean", "--global"],
      homePath,
      input: "y\r",
      projectPath,
      prompt: globalConfirmationPrompt,
    })

    expect(result.exitCode).toBe(0)
    expect(await exists(referencePath)).toBe(true)
    expect(await readFile(lockfilePath, "utf8")).toBe(lockfileContents)
    expect(await readFile(config.configPath, "utf8")).toBe(config.contents)
  })

  it("reports an empty global store", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()

    const result = await context.runCli({
      args: ["clean", "--global"],
      homePath,
      input: "y\r",
      projectPath,
      prompt: globalConfirmationPrompt,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("No global store entries found")
  })

  it("preserves the global store when global confirmation is cancelled", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const entryPath = await materializeStoreEntry(homePath, "zod", "4.0.0")

    const result = await context.runCli({
      args: ["clean", "--global"],
      homePath,
      input: "\u0003",
      projectPath,
      prompt: globalConfirmationPrompt,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("You've cancelled the clean process.")
    expect(result.output).not.toContain("Operation cancelled")
    expect(await exists(entryPath)).toBe(true)
  })
})
