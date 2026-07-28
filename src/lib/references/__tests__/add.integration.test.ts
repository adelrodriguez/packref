import { afterEach, describe, expect, it } from "bun:test"
import { access, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { parsePackageSpec } from "#lib/core/packages.ts"
import { PackageManagerResolver } from "#lib/manifests/javascript.ts"
import { addPackageReference } from "#lib/references/add.ts"
import { NpmRegistryClient } from "#lib/registries/npm/client.ts"
import { CommandRunner } from "#lib/services/command-runner.ts"
import { PackrefHome } from "#lib/services/packref-home.ts"
import { Reflinker } from "#lib/services/reflinker.ts"
import { RepositoryDownloader } from "#lib/sources/repository/fetch.ts"

const temporaryPaths: string[] = []

const PackrefServices = Layer.mergeAll(
  CommandRunner.layer,
  NpmRegistryClient.layer,
  PackageManagerResolver.layer,
  Reflinker.layer,
  RepositoryDownloader.layer
)
const RealLayers = Layer.provideMerge(
  PackrefServices,
  Layer.mergeAll(NodeHttpClient.layerFetch, NodeServices.layer)
)

const makeTempDirectory = async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "packref-add-integration-test-"))
  temporaryPaths.push(directoryPath)
  return directoryPath
}

const exists = (path: string) =>
  access(path)
    .then(() => true)
    .catch(() => false)

const runAdd = (packageSpec: string, projectPath: string, home: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const spec = yield* parsePackageSpec(packageSpec)

      return yield* addPackageReference(spec, { projectPath })
    }).pipe(Effect.provide(Layer.mergeAll(RealLayers, PackrefHome.at(home))))
  )

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { force: true, recursive: true }))
  )
})

describe("addPackageReference integration", () => {
  it("fetches is-number from its matching GitHub tag", async () => {
    const projectPath = await makeTempDirectory()
    const home = await makeTempDirectory()
    const result = await runAdd("is-number@7.0.0", projectPath, home)
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )

    expect(result.entry.source.type).toBe("repository")
    expect(await exists(result.referencePath)).toBe(true)
    expect(await exists(join(result.referencePath, "package.json"))).toBe(true)
    expect(lockfile.packages).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({ type: "repository" }),
      }),
    ])
  }, 180_000)

  it("falls back to the lsb32 tarball when npm metadata has no repository", async () => {
    const projectPath = await makeTempDirectory()
    const home = await makeTempDirectory()
    const result = await runAdd("lsb32@0.2.0", projectPath, home)
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )
    const tarballUrl = "https://registry.npmjs.org/lsb32/-/lsb32-0.2.0.tgz"

    expect(result.entry.source).toEqual({ type: "tarball", url: tarballUrl })
    expect(lockfile.packages).toEqual([
      expect.objectContaining({
        source: {
          type: "tarball",
          url: tarballUrl,
        },
      }),
    ])
  }, 180_000)
})
