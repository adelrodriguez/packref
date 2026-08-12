import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { execPath } from "node:process"
import type { Lockfile, PackageEntry } from "#lib/core/workspace.ts"

const temporaryPaths: string[] = []
const cliPath = resolve(import.meta.dir, "../../index.ts")

const makeTempDirectory = async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "packref-list-test-"))
  temporaryPaths.push(directoryPath)
  return directoryPath
}

const initializeProject = async (projectPath: string, packages: readonly PackageEntry[]) => {
  const directoryPath = join(projectPath, ".packref")
  await mkdir(directoryPath, { recursive: true })
  await writeFile(
    join(directoryPath, "packref-lock.json"),
    `${JSON.stringify({ packages } satisfies Lockfile, null, 2)}\n`
  )
}

const runList = async (projectPath: string, homePath: string, command: "list" | "ls" = "list") => {
  let output = ""
  const environment = { ...Bun.env }
  delete environment.NO_COLOR
  const process = Bun.spawn({
    cmd: [execPath, cliPath, command],
    cwd: projectPath,
    env: {
      ...environment,
      FORCE_COLOR: "1",
      HOME: homePath,
      TERM: "xterm-256color",
    },
    terminal: {
      cols: 100,
      data: (_terminal, data) => {
        output += Buffer.from(data).toString("utf8")
      },
      rows: 24,
    },
  })

  return {
    exitCode: await process.exited,
    output,
  }
}

const repositoryEntry = (
  name: string,
  version: string,
  tracking: PackageEntry["tracking"] = "manual"
) =>
  ({
    name,
    registry: "npm",
    source: {
      host: "github.com",
      type: "repository",
      url: `https://github.com/example/${name}`,
    },
    tracking,
    version,
  }) satisfies PackageEntry

const tarballEntry = (
  name: string,
  version: string,
  tracking: PackageEntry["tracking"] = "dependency"
) =>
  ({
    name,
    registry: "npm",
    source: {
      type: "tarball",
      url: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
    },
    tracking,
    version,
  }) satisfies PackageEntry

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { force: true, recursive: true }))
  )
})

describe("list", () => {
  it("prints a helpful message for an empty initialized project", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    await initializeProject(projectPath, [])

    const result = await runList(projectPath, homePath)

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("No packages are currently installed.")
  })

  it("supports ls as an alias", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    await initializeProject(projectPath, [])

    const result = await runList(projectPath, homePath, "ls")

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("No packages are currently installed.")
  })

  it("prints repository and tarball entries in deterministic identity order", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    await initializeProject(projectPath, [
      repositoryEntry("zod", "4.0.0", "dependency"),
      tarballEntry("react", "19.0.0", "manual"),
      repositoryEntry("react", "18.3.1", "dependency"),
    ])

    const result = await runList(projectPath, homePath)
    const output = Bun.stripANSI(result.output)
    const packageLines = output.split("\n").filter((line) => line.includes("npm:"))

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("\u001B[90mnpm:\u001B[39m")
    expect(result.output).toContain("\u001B[1mreact\u001B[22m")
    expect(result.output).toContain("\u001B[2m\u001B[33m@18.3.1\u001B[39m\u001B[22m")
    expect(result.output).toContain("\u001B[33m(manual)\u001B[39m")
    expect(output).toContain("Packref packages (3)")
    expect(packageLines).toEqual([
      "├── npm:react@18.3.1  github.com\r",
      "├── npm:react@19.0.0  tarball     (manual)\r",
      "└── npm:zod@4.0.0     github.com\r",
    ])
  })

  it("reports an uninitialized project", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()

    const result = await runList(projectPath, homePath)

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("Run `packref init` first")
  })

  it("reports a .packref path that is not a directory as uninitialized", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    await writeFile(join(projectPath, ".packref"), "not a directory")

    const result = await runList(projectPath, homePath)

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("Run `packref init` first")
  })
})
