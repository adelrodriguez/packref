import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Tar from "effect/encoding/Tar"
import * as Exit from "effect/Exit"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Layer from "effect/Layer"
import { afterEach, describe, expect, it } from "vitest"
import { SnapshotFetchError } from "#lib/core/errors.ts"
import { PackrefHome } from "#lib/layout/home.ts"
import { fetchRepositorySnapshot, RepositoryDownloader } from "#lib/sources/repository/fetch.ts"
import { makeArchive } from "#lib/sources/tarball/__tests__/archive.ts"

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
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | RepositoryDownloader>,
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

const downloadArchive = async (source: string, ref: string, archive: Uint8Array, status = 200) => {
  const destination = await makeTempDirectory()
  const requests: Array<{
    readonly headers: Readonly<Record<string, string>>
    readonly url: string
  }> = []
  const httpClientLayer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => {
      requests.push({ headers: request.headers, url: request.url })

      return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(archive, { status })))
    })
  )

  const result = await Effect.runPromiseExit(
    Effect.flatMap(RepositoryDownloader, (downloader) =>
      downloader.download(source, ref, destination)
    ).pipe(
      Effect.provide(
        RepositoryDownloader.layer.pipe(
          Layer.provide(Layer.mergeAll(NodeServices.layer, httpClientLayer))
        )
      )
    )
  )

  return { destination, requests, result }
}

describe("RepositoryDownloader", () => {
  it.each([
    {
      source: "github:owner/repo",
      url: "https://api.github.com/repos/owner/repo/tarball/v1.0.0",
    },
    {
      source: "gitlab:group/subgroup/repo",
      url: "https://gitlab.com/group/subgroup/repo/-/archive/v1.0.0.tar.gz",
    },
    { source: "bitbucket:owner/repo", url: "https://bitbucket.org/owner/repo/get/v1.0.0.tar.gz" },
    { source: "sourcehut:owner/repo", url: "https://git.sr.ht/~owner/repo/archive/v1.0.0.tar.gz" },
  ])("downloads the archive of $source from $url", async ({ source, url }) => {
    const archive = await makeArchive([Tar.file("repo-v1.0.0/README.md", "source")])
    const { destination, requests, result } = await downloadArchive(source, "v1.0.0", archive)

    expect(Exit.isSuccess(result)).toBe(true)
    expect(requests.map((request) => request.url)).toEqual([url])
    expect(await readFile(join(destination, "README.md"), "utf8")).toBe("source")
  })

  it("asks the GitHub API for the tarball of a tag with slashes", async () => {
    const archive = await makeArchive([Tar.file("repo-abc/README.md", "source")])
    const { requests } = await downloadArchive("github:owner/repo", "@scope/pkg@1.0.0", archive)

    expect(requests).toEqual([
      {
        headers: expect.objectContaining({
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        }),
        url: "https://api.github.com/repos/owner/repo/tarball/@scope/pkg@1.0.0",
      },
    ])
  })

  it("leaves symlinks out of the snapshot", async () => {
    const archive = await makeArchive([
      Tar.file("repo-v1.0.0/README.md", "source"),
      Tar.symlink("repo-v1.0.0/packages/app/README.md", "../../README.md"),
      Tar.symlink("repo-v1.0.0/secret", "/etc/passwd"),
    ])
    const { destination, result } = await downloadArchive("github:owner/repo", "v1.0.0", archive)

    expect(Exit.isSuccess(result)).toBe(true)
    expect(await readdir(destination, { recursive: true })).toEqual(["README.md"])
  })

  it("fails with SnapshotFetchError when the host does not have the archive", async () => {
    const { result } = await downloadArchive("github:owner/repo", "v9.9.9", new Uint8Array(), 404)

    expect(Exit.isFailure(result) && Cause.squash(result.cause)).toMatchObject({
      _tag: "SnapshotFetchError",
      source: "github:owner/repo#v9.9.9",
    })
  })
})
