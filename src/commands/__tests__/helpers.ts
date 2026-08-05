import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { execPath } from "node:process"
import * as Predicate from "effect/Predicate"
import type { Lockfile, PackageEntry } from "#lib/workspace/lockfile.ts"

const cliPath = resolve(import.meta.dir, "../../index.ts")

interface RunCliOptions {
  readonly args: readonly string[]
  readonly homePath: string
  readonly input?: string
  readonly projectPath: string
  readonly prompt?: string
}

export const makeCommandTestContext = (prefix: string) => {
  const temporaryPaths: string[] = []

  return {
    cleanup: async () => {
      await Promise.all(
        temporaryPaths
          .splice(0)
          .map((directoryPath) => rm(directoryPath, { force: true, recursive: true }))
      )
    },
    makeTempDirectory: async () => {
      const directoryPath = await mkdtemp(join(tmpdir(), prefix))
      temporaryPaths.push(directoryPath)
      return directoryPath
    },
    runCli: async ({ args, homePath, input, projectPath, prompt }: RunCliOptions) => {
      let output = ""
      let answeredPrompt = false
      const process = Bun.spawn({
        cmd: [execPath, cliPath, ...args],
        cwd: projectPath,
        env: {
          ...Bun.env,
          HOME: homePath,
        },
        terminal: {
          cols: 100,
          data: (_terminal, data) => {
            output += Buffer.from(data).toString("utf8")

            if (
              !answeredPrompt &&
              Predicate.isNotUndefined(input) &&
              Predicate.isNotUndefined(prompt) &&
              output.includes(prompt)
            ) {
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
    },
  }
}

export const exists = (path: string) =>
  access(path)
    .then(() => true)
    .catch(() => false)

export const initializeProject = async (projectPath: string, packages: readonly PackageEntry[]) => {
  const directoryPath = join(projectPath, ".packref")
  await mkdir(directoryPath, { recursive: true })
  await writeFile(
    join(directoryPath, "packref-lock.json"),
    `${JSON.stringify({ packages } satisfies Lockfile, null, 2)}\n`
  )
}

export const materializeReference = async (projectPath: string, entry: PackageEntry) => {
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

export const repositoryEntry = (
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
