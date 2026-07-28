import { afterEach, describe, expect, it } from "bun:test"
import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { SnapshotFetchError } from "#lib/core/errors.ts"
import { PackrefHome } from "#lib/services/packref-home.ts"
import { fetchRepositorySnapshot, RepositoryDownloader } from "#lib/sources/repository/fetch.ts"

const temporaryPaths: string[] = []

const makeTempDirectory = async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "packref-repository-fetch-test-"))
  temporaryPaths.push(directoryPath)
  return directoryPath
}

const identity = {
  name: "example",
  registry: "npm",
  version: "1.0.0",
}

const repository = {
  ref: "v1.0.0",
  source: {
    fetchSource: "github:example/example",
    host: "github.com",
    type: "repository" as const,
    url: "https://github.com/example/example",
  },
}

const exists = (path: string) =>
  access(path)
    .then(() => true)
    .catch(() => false)

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | Path.Path | RepositoryDownloader | PackrefHome
  >,
  home: string,
  download: RepositoryDownloader["Service"]["download"]
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        Layer.mergeAll(
          NodeServices.layer,
          PackrefHome.at(home),
          Layer.succeed(RepositoryDownloader)({
            download,
          })
        )
      )
    )
  )

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

describe("fetchRepositorySnapshot", () => {
  it("downloads into a temporary directory and atomically installs the store entry", async () => {
    const home = await makeTempDirectory()
    const result = await run(
      fetchRepositorySnapshot(identity, repository),
      home,
      (_source, _ref, destination) =>
        Effect.promise(() => writeFile(join(destination, "README.md"), "source"))
    )

    expect(result.reused).toBe(false)
    expect(await readFile(join(result.path, "README.md"), "utf8")).toBe("source")
    expect(await readdir(result.path)).toEqual(["README.md"])
    expect(
      await readdir(join(home, ".agents", "packref", "store", "packages", "npm", "example"))
    ).toEqual(["1.0.0"])
  })

  it("reuses an existing store entry without downloading again", async () => {
    const home = await makeTempDirectory()
    let downloadCount = 0
    const download = (_source: string, _ref: string, destination: string) => {
      downloadCount += 1
      return Effect.promise(() => writeFile(join(destination, "index.ts"), "export {}"))
    }

    const first = await run(fetchRepositorySnapshot(identity, repository), home, download)
    const second = await run(fetchRepositorySnapshot(identity, repository), home, download)

    expect(first.reused).toBe(false)
    expect(second.reused).toBe(true)
    expect(downloadCount).toBe(1)
  })

  it("removes temporary data when downloading fails", async () => {
    const home = await makeTempDirectory()

    try {
      await run(fetchRepositorySnapshot(identity, repository), home, (_source, _ref, destination) =>
        Effect.promise(() => writeFile(join(destination, "partial.txt"), "partial")).pipe(
          Effect.andThen(
            Effect.fail(
              new SnapshotFetchError({
                cause: "download failed",
                source: repository.source.fetchSource,
              })
            )
          )
        )
      )
      throw new Error("Expected the repository fetch to fail.")
    } catch (error) {
      expect(error).toBeInstanceOf(SnapshotFetchError)
    }

    const packageParent = join(home, ".agents", "packref", "store", "packages", "npm", "example")
    expect(await exists(join(packageParent, "1.0.0"))).toBe(false)
    expect(await readdir(packageParent)).toEqual([])
  })
})
