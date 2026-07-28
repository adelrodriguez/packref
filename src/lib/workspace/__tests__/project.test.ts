import { afterEach, describe, expect, it } from "bun:test"
import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { ReflinkError } from "#lib/core/errors.ts"
import { Reflinker } from "#lib/services/reflinker.ts"
import {
  initializeLockfile,
  readLockfileAtPath,
  upsertPackageEntry,
} from "#lib/workspace/lockfile.ts"
import { createProjectReference, ensureDirectory } from "#lib/workspace/project.ts"

const temporaryPaths: string[] = []
const ProjectTestLayer = Layer.mergeAll(NodeServices.layer, Reflinker.layer)

const makeTempDirectory = async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "packref-project-test-"))
  temporaryPaths.push(directoryPath)
  return directoryPath
}

const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Reflinker>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ProjectTestLayer)))

const exists = (path: string) =>
  access(path)
    .then(() => true)
    .catch(() => false)

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((directoryPath) =>
      rm(directoryPath, {
        force: true,
        recursive: true,
      })
    )
  )
})

describe("project references", () => {
  it("materializes repository.directory as the project-local reference", async () => {
    const projectPath = await makeTempDirectory()
    const storePath = await makeTempDirectory()
    await mkdir(join(storePath, "packages", "cli", "src"), { recursive: true })
    await writeFile(join(storePath, "README.md"), "repository root")
    await writeFile(join(storePath, "packages", "cli", "src", "index.ts"), "export {}")
    await run(ensureDirectory(projectPath))

    const referencePath = await run(
      createProjectReference(
        projectPath,
        {
          name: "@effect/cli",
          registry: "npm",
          version: "0.70.0",
        },
        storePath,
        {
          directory: "packages/cli",
          host: "github.com",
          type: "repository",
          url: "https://github.com/Effect-TS/effect",
        }
      )
    )

    expect(await readFile(join(referencePath, "src", "index.ts"), "utf8")).toBe("export {}")
    expect(await exists(join(referencePath, "README.md"))).toBe(false)
    expect(
      await readdir(join(projectPath, ".packref", "packages", "npm", "@effect", "cli"))
    ).toEqual(["0.70.0"])
  })

  it("rejects repository directories that escape the stored snapshot", async () => {
    const projectPath = await makeTempDirectory()
    const storePath = await makeTempDirectory()
    await run(ensureDirectory(projectPath))

    try {
      await run(
        createProjectReference(
          projectPath,
          {
            name: "example",
            registry: "npm",
            version: "1.0.0",
          },
          storePath,
          {
            directory: "../outside",
            host: "github.com",
            type: "repository",
            url: "https://github.com/example/example",
          }
        )
      )
      throw new Error("Expected project reference creation to fail.")
    } catch (error) {
      expect(error).toBeInstanceOf(ReflinkError)
    }
  })

  it("cleans partial copies before retrying project materialization", async () => {
    const projectPath = await makeTempDirectory()
    const storePath = await makeTempDirectory()
    await writeFile(join(storePath, "index.ts"), "export const complete = true")
    await run(ensureDirectory(projectPath))
    const identity = {
      name: "example",
      registry: "npm",
      version: "1.0.0",
    }
    const source = {
      host: "github.com",
      type: "repository" as const,
      url: "https://github.com/example/example",
    }
    const referencePath = join(projectPath, ".packref", "packages", "npm", "example", "1.0.0")
    const failingReflinker = Layer.succeed(Reflinker)({
      reflink: (copySource, copyTarget) =>
        Effect.tryPromise({
          catch: (cause) =>
            new ReflinkError({
              cause,
              source: copySource,
              target: copyTarget,
            }),
          try: async () => {
            await mkdir(copyTarget, { recursive: true })
            await writeFile(join(copyTarget, "partial.txt"), "partial")
            throw new Error("copy interrupted")
          },
        }),
    })

    try {
      await Effect.runPromise(
        createProjectReference(projectPath, identity, storePath, source).pipe(
          Effect.provide(Layer.mergeAll(NodeServices.layer, failingReflinker))
        )
      )
      throw new Error("Expected project reference creation to fail.")
    } catch (error) {
      expect(error).toBeInstanceOf(ReflinkError)
    }

    expect(await exists(referencePath)).toBe(false)

    const retriedReferencePath = await run(
      createProjectReference(projectPath, identity, storePath, source)
    )

    expect(retriedReferencePath).toBe(referencePath)
    expect(await readFile(join(referencePath, "index.ts"), "utf8")).toBe(
      "export const complete = true"
    )
    expect(await exists(join(referencePath, "partial.txt"))).toBe(false)
  })
})

describe("lockfile upsert", () => {
  it("is idempotent by full identity and allows multiple versions", async () => {
    const projectPath = await makeTempDirectory()
    await run(ensureDirectory(projectPath))
    await run(initializeLockfile(projectPath))
    const firstEntry = {
      name: "react",
      registry: "npm",
      source: {
        host: "github.com",
        type: "repository" as const,
        url: "https://github.com/facebook/react",
      },
      tracking: "manual" as const,
      version: "18.3.1",
    }
    const secondEntry = {
      ...firstEntry,
      version: "19.0.0",
    }

    await run(upsertPackageEntry(projectPath, firstEntry))
    await run(upsertPackageEntry(projectPath, firstEntry))
    await run(upsertPackageEntry(projectPath, secondEntry))

    const lockfile = await run(
      readLockfileAtPath(join(projectPath, ".packref", "packref-lock.json"))
    )

    expect(lockfile.packages).toEqual([firstEntry, secondEntry])
    expect(await readdir(join(projectPath, ".packref"))).toEqual(["packref-lock.json"])
  })
})
