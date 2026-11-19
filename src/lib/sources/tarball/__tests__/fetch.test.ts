import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import { access, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Tar from "effect/encoding/Tar"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Layer from "effect/Layer"
import { afterEach, describe, expect, it } from "vitest"
import { TarballFetchError } from "#lib/core/errors.ts"
import { PackrefHome } from "#lib/layout/home.ts"
import { makeArchive } from "#lib/sources/tarball/__tests__/archive.ts"
import { fetchTarballSnapshot } from "#lib/sources/tarball/fetch.ts"

const temporaryPaths: string[] = []

const makeTempDirectory = async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "packref-tarball-fetch-test-"))
  temporaryPaths.push(directoryPath)

  return directoryPath
}

const identity = {
  name: "example",
  registry: "npm",
  version: "1.0.0",
}

const tarballUrl = "https://registry.npmjs.org/example/-/example-1.0.0.tgz"

const exists = (path: string) =>
  access(path)
    .then(() => true)
    .catch(() => false)

const run = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | HttpClient.HttpClient | Path.Path>,
  home: string,
  download: () => Effect.Effect<Uint8Array>,
  getStatus: () => number = () => 200
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide([
        NodeServices.layer,
        PackrefHome.at(home),
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) =>
            download().pipe(
              Effect.map((archive) =>
                HttpClientResponse.fromWeb(
                  request,
                  new Response(archive, {
                    status: getStatus(),
                  })
                )
              )
            )
          )
        ),
      ])
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

describe("fetchTarballSnapshot", () => {
  it("extracts package contents without the package/ prefix", async () => {
    const home = await makeTempDirectory()

    const archive = await makeArchive([
      Tar.directory("package/"),
      Tar.file("package/src/index.ts", "export const answer = 42"),
    ])

    const result = await run(fetchTarballSnapshot(identity, tarballUrl), home, () =>
      Effect.succeed(archive)
    )

    expect(result.reused).toBe(false)
    expect(await readFile(join(result.path, "src", "index.ts"), "utf8")).toBe(
      "export const answer = 42"
    )
    expect(await exists(join(result.path, "package"))).toBe(false)
  })

  it("strips a crate-style top-level archive directory", async () => {
    const home = await makeTempDirectory()

    const archive = await makeArchive([
      Tar.file("example-1.0.0/Cargo.toml", '[package]\nname = "example"'),
    ])

    const result = await run(fetchTarballSnapshot(identity, tarballUrl), home, () =>
      Effect.succeed(archive)
    )

    expect(await readFile(join(result.path, "Cargo.toml"), "utf8")).toBe(
      '[package]\nname = "example"'
    )
    expect(await exists(join(result.path, "example-1.0.0"))).toBe(false)
  })

  it("rejects archives with multiple top-level directories", async () => {
    const home = await makeTempDirectory()

    const archive = await makeArchive([
      Tar.file("package/package.json", "{}"),
      Tar.file("other/file.txt", "unexpected"),
    ])

    const extraction = run(fetchTarballSnapshot(identity, tarballUrl), home, () =>
      Effect.succeed(archive)
    )

    await expect(extraction).rejects.toBeInstanceOf(TarballFetchError)
    await expect(extraction).rejects.toMatchObject({
      cause: "Package archive must contain exactly one top-level directory",
      url: tarballUrl,
    })
    const packageParent = join(home, ".agents", "packref", "store", "packages", "npm", "example")
    expect(await readdir(packageParent)).toEqual([])
  })

  it("keeps the permission bits of a file", async () => {
    const home = await makeTempDirectory()

    const archive = await makeArchive([
      Tar.file("package/bin/cli.js", "#!/usr/bin/env node", { mode: 0o755 }),
    ])

    const result = await run(fetchTarballSnapshot(identity, tarballUrl), home, () =>
      Effect.succeed(archive)
    )

    const { mode } = await stat(join(result.path, "bin", "cli.js"))

    expect(mode & 0o777).toBe(0o755)
  })

  it.each([
    {
      cause: "Archive entry contains an invalid path: package/../escape.txt",
      entry: Tar.file("package/../escape.txt", "escape"),
    },
    {
      cause: "Archive entry does not use the expected package/ prefix: package",
      entry: Tar.file("package", "no directory"),
    },
    {
      cause: "Archive entry type is not supported: Symlink",
      entry: Tar.symlink("package/link", "/etc/passwd"),
    },
  ])("rejects the archive entry $entry.header.path", async ({ cause, entry }) => {
    const home = await makeTempDirectory()
    const archive = await makeArchive([Tar.file("package/package.json", "{}"), entry])

    await expect(
      run(fetchTarballSnapshot(identity, tarballUrl), home, () => Effect.succeed(archive))
    ).rejects.toMatchObject({ cause, url: tarballUrl })
    const packageParent = join(home, ".agents", "packref", "store", "packages", "npm", "example")
    expect(await readdir(packageParent)).toEqual([])
  })

  it("rejects an empty archive", async () => {
    const home = await makeTempDirectory()
    const archive = await makeArchive([])

    await expect(
      run(fetchTarballSnapshot(identity, tarballUrl), home, () => Effect.succeed(archive))
    ).rejects.toMatchObject({
      cause: "Package archive must contain exactly one top-level directory",
    })
  })

  it("reuses an existing tarball store entry", async () => {
    const home = await makeTempDirectory()
    const archive = await makeArchive([Tar.file("package/package.json", "{}")])
    let downloadCount = 0

    const download = () => {
      downloadCount += 1

      return Effect.succeed(archive)
    }

    const first = await run(fetchTarballSnapshot(identity, tarballUrl), home, download)
    const second = await run(fetchTarballSnapshot(identity, tarballUrl), home, download)

    expect(first.reused).toBe(false)
    expect(second.reused).toBe(true)
    expect(downloadCount).toBe(1)
  })

  it("fails safely and removes temporary data for invalid archives", async () => {
    const home = await makeTempDirectory()

    await expect(
      run(fetchTarballSnapshot(identity, tarballUrl), home, () =>
        Effect.succeed(new Uint8Array([1, 2, 3]))
      )
    ).rejects.toBeInstanceOf(TarballFetchError)

    const packageParent = join(home, ".agents", "packref", "store", "packages", "npm", "example")
    expect(await exists(join(packageParent, "1.0.0"))).toBe(false)
    expect(await readdir(packageParent)).toEqual([])
  })

  it("retries transient tarball responses before it succeeds", async () => {
    const home = await makeTempDirectory()
    const archive = await makeArchive([Tar.file("package/package.json", "{}")])
    let requestCount = 0

    const result = await run(
      fetchTarballSnapshot(identity, tarballUrl),
      home,
      () => Effect.succeed(archive),
      () => {
        requestCount += 1

        return requestCount < 3 ? 503 : 200
      }
    )

    expect(result.reused).toBe(false)
    expect(requestCount).toBe(3)
  })

  it("does not retry a 404 tarball response", async () => {
    const home = await makeTempDirectory()
    let requestCount = 0

    const download = run(
      fetchTarballSnapshot(identity, tarballUrl),
      home,
      () => Effect.succeed(new Uint8Array()),
      () => {
        requestCount += 1

        return 404
      }
    )

    await expect(download).rejects.toBeInstanceOf(TarballFetchError)
    expect(requestCount).toBe(1)
  })

  it("rejects non-successful tarball responses after bounded retries", async () => {
    const home = await makeTempDirectory()
    let requestCount = 0

    const download = run(
      fetchTarballSnapshot(identity, tarballUrl),
      home,
      () => Effect.succeed(new Uint8Array()),
      () => {
        requestCount += 1

        return 503
      }
    )

    await expect(download).rejects.toBeInstanceOf(TarballFetchError)
    expect(requestCount).toBe(3)
  })
})
