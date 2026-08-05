import { afterEach, describe, expect, it } from "bun:test"
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { execPath } from "node:process"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import { type Lockfile, type PackageEntry, readProjectLockfile } from "#lib/workspace/lockfile.ts"

const temporaryPaths: string[] = []
const cliPath = resolve(import.meta.dir, "../../index.ts")

const makeTempDirectory = async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "packref-remove-test-"))
  temporaryPaths.push(directoryPath)
  return directoryPath
}

const exists = (path: string) =>
  access(path)
    .then(() => true)
    .catch(() => false)

const initializeProject = async (projectPath: string, packages: readonly PackageEntry[]) => {
  const directoryPath = join(projectPath, ".packref")
  await mkdir(directoryPath, { recursive: true })
  await writeFile(
    join(directoryPath, "packref-lock.json"),
    `${JSON.stringify({ packages } satisfies Lockfile, null, 2)}\n`
  )
}

const materializeReference = async (projectPath: string, entry: PackageEntry) => {
  const referencePath = entry.name.startsWith("@")
    ? join(
        projectPath,
        ".packref",
        "packages",
        entry.registry,
        ...entry.name.split("/"),
        entry.version
      )
    : join(projectPath, ".packref", "packages", entry.registry, entry.name, entry.version)

  await mkdir(referencePath, { recursive: true })
  await writeFile(join(referencePath, "SOURCE.md"), "source")
  return referencePath
}

const runRemove = async (
  projectPath: string,
  homePath: string,
  packageSpec: string,
  input?: string
) => {
  let output = ""
  let answeredPrompt = false
  const process = Bun.spawn({
    cmd: [execPath, cliPath, "remove", packageSpec],
    cwd: projectPath,
    env: {
      ...Bun.env,
      HOME: homePath,
    },
    terminal: {
      cols: 100,
      data: (_terminal, data) => {
        output += Buffer.from(data).toString("utf8")

        if (!answeredPrompt && input !== undefined && output.includes("Select versions")) {
          answeredPrompt = true
          process.terminal?.write(input)
        }
      },
      rows: 24,
    },
  })

  return {
    exitCode: await process.exited,
    output,
  }
}

const repositoryEntry = (name: string, version: string) =>
  ({
    name,
    registry: "npm",
    source: {
      host: "github.com",
      type: "repository",
      url: `https://github.com/example/${name}`,
    },
    tracking: "manual",
    version,
  }) satisfies PackageEntry

const tarballEntry = (name: string, version: string) =>
  ({
    name,
    registry: "npm",
    source: {
      type: "tarball",
      url: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
    },
    tracking: "dependency",
    version,
  }) satisfies PackageEntry

const readLockfile = (projectPath: string) =>
  Effect.runPromise(readProjectLockfile(projectPath).pipe(Effect.provide(NodeServices.layer)))

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { force: true, recursive: true }))
  )
})

describe("remove", () => {
  it("removes only an exact local version and preserves the global store", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    const react18 = repositoryEntry("react", "18.3.1")
    const react19 = repositoryEntry("react", "19.0.0")
    await initializeProject(projectPath, [react18, react19])
    const react18Path = await materializeReference(projectPath, react18)
    const react19Path = await materializeReference(projectPath, react19)
    const storedSourcePath = join(
      homePath,
      ".agents",
      "packref",
      "store",
      "packages",
      "npm",
      "react",
      "18.3.1"
    )
    await mkdir(storedSourcePath, { recursive: true })
    await writeFile(join(storedSourcePath, "SOURCE.md"), "global source")

    const result = await runRemove(projectPath, homePath, "npm:react@18.3.1")

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Removed npm:react@18.3.1")
    expect(await exists(react18Path)).toBe(false)
    expect(await exists(react19Path)).toBe(true)
    expect(await exists(storedSourcePath)).toBe(true)
    const lockfile = await readLockfile(projectPath)
    expect(lockfile.packages).toEqual([react19])
  })

  it("removes a name-only match directly when only one version exists", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    const entry = repositoryEntry("@effect/cli", "0.70.0")
    await initializeProject(projectPath, [entry])
    const referencePath = await materializeReference(projectPath, entry)

    const result = await runRemove(projectPath, homePath, "@effect/cli")

    expect(result.exitCode).toBe(0)
    expect(result.output).not.toContain("Select versions")
    expect(await exists(referencePath)).toBe(false)
    const lockfile = await readLockfile(projectPath)
    expect(lockfile.packages).toEqual([])
  })

  it("shows a multiselect when a name matches multiple versions", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    const react18 = repositoryEntry("react", "18.3.1")
    const react19 = repositoryEntry("react", "19.0.0")
    await initializeProject(projectPath, [react19, react18])
    const react18Path = await materializeReference(projectPath, react18)
    const react19Path = await materializeReference(projectPath, react19)

    const result = await runRemove(projectPath, homePath, "react", "\u001B[B \r")

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Select versions of npm:react to remove")
    expect(await exists(react18Path)).toBe(true)
    expect(await exists(react19Path)).toBe(false)
    const lockfile = await readLockfile(projectPath)
    expect(lockfile.packages).toEqual([react18])
  })

  it("warns and succeeds when the local directory is already missing", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    const entry = tarballEntry("example", "1.0.0")
    await initializeProject(projectPath, [entry])

    const result = await runRemove(projectPath, homePath, "example")

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("was already missing; removed its lockfile entry")
    const lockfile = await readLockfile(projectPath)
    expect(lockfile.packages).toEqual([])
  })

  it("reports a package that is not referenced", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    await initializeProject(projectPath, [])

    const result = await runRemove(projectPath, homePath, "react")

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("Package `npm:react` is not referenced")
  })

  it("reports an uninitialized project", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()

    const result = await runRemove(projectPath, homePath, "react")

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("Run `packref init` first")
  })
})
