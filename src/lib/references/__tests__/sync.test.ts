import { afterEach, describe, expect, it } from "bun:test"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"
import { createTarGzip } from "nanotar"
import type { NpmPackageMetadata } from "#lib/core/npm.ts"
import type { Lockfile, PackageEntry } from "#lib/core/workspace.ts"
import { NotInitializedError, UnsupportedManifestError } from "#lib/core/errors.ts"
import { ProjectDependencyReader } from "#lib/manifests/index.ts"
import { PackageManagerResolver } from "#lib/manifests/javascript.ts"
import { preparePackageReferenceSync, syncPackageReferences } from "#lib/references/sync.ts"
import { NpmRegistryClient } from "#lib/registries/npm/client.ts"
import { RepositoryDownloader } from "#lib/sources/repository/fetch.ts"
import { RemoteTagReader } from "#lib/sources/repository/tags.ts"
import { PackrefHome } from "#lib/workspace/home.ts"
import { Reflinker } from "#lib/workspace/reflinker.ts"

const temporaryPaths: string[] = []

const makeTempDirectory = async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "packref-sync-test-"))
  temporaryPaths.push(directoryPath)
  return directoryPath
}

const exists = (path: string) =>
  access(path)
    .then(() => true)
    .catch(() => false)

const makeEntry = (
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

const initializeProject = async (
  projectPath: string,
  dependencies: Readonly<Record<string, string>>,
  packages: readonly PackageEntry[]
) => {
  await mkdir(join(projectPath, ".packref"), { recursive: true })
  await writeFile(join(projectPath, "package.json"), JSON.stringify({ dependencies }))
  await writeFile(
    join(projectPath, ".packref", "packref-lock.json"),
    `${JSON.stringify({ packages } satisfies Lockfile, null, 2)}\n`
  )
}

const getReferencePath = (projectPath: string, entry: PackageEntry) =>
  join(projectPath, ".packref", "packages", entry.registry, entry.name, entry.version)

const materializeReference = async (projectPath: string, entry: PackageEntry) => {
  const referencePath = getReferencePath(projectPath, entry)
  await mkdir(referencePath, { recursive: true })
  await writeFile(join(referencePath, "SOURCE.md"), "old source")
  return referencePath
}

const makeMetadata = (name: string, versions: readonly string[]) =>
  ({
    "dist-tags": { latest: versions.at(-1) },
    name,
    versions: Object.fromEntries(
      versions.map((version) => [
        version,
        {
          dist: {
            tarball: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
          },
          version,
        },
      ])
    ),
  }) satisfies NpmPackageMetadata

interface TestServices {
  readonly exactVersions?: Readonly<Record<string, string>>
  readonly metadata?: Readonly<Record<string, NpmPackageMetadata>>
  readonly onMetadataRequest?: (name: string) => void
  readonly tarballStatus?: number
}

const makeTestLayer = (homePath: string, services: TestServices = {}) => {
  const packageManagerLayer = Layer.succeed(PackageManagerResolver)({
    resolveLockedVersions: (_projectPath, dependencies) =>
      Effect.succeed(
        new Map(
          dependencies.flatMap((dependency) => {
            const version = services.exactVersions?.[dependency.name]
            return version === undefined ? [] : [[dependency.name, version] as const]
          })
        )
      ),
  })
  const manifestLayer = Layer.provideMerge(
    ProjectDependencyReader.layer,
    Layer.mergeAll(NodeServices.layer, packageManagerLayer)
  )

  return Layer.mergeAll(
    NodeServices.layer,
    PackrefHome.at(homePath),
    manifestLayer,
    Reflinker.layer,
    Layer.succeed(NpmRegistryClient)({
      getPackageMetadata: (name) => {
        services.onMetadataRequest?.(name)
        const metadata = services.metadata?.[name]
        return metadata === undefined
          ? Effect.die(`Unexpected metadata request for ${name}`)
          : Effect.succeed(metadata)
      },
    }),
    RemoteTagReader.layerWithCommand(() =>
      Effect.die("Repository tag commands are not expected in sync tests")
    ),
    Layer.succeed(RepositoryDownloader)({
      download: () => Effect.die("Repository downloads are not expected in sync tests"),
    }),
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.promise(() =>
          createTarGzip([
            {
              data: "new source",
              name: "package/SOURCE.md",
            },
          ])
        ).pipe(
          Effect.map((archive) =>
            HttpClientResponse.fromWeb(
              request,
              new Response(archive, { status: services.tarballStatus ?? 200 })
            )
          )
        )
      )
    )
  )
}

const runSync = async (projectPath: string, homePath: string, services: TestServices = {}) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const preparation = yield* preparePackageReferenceSync({ projectPath })
      const result = yield* syncPackageReferences(preparation)
      return { preparation, result }
    }).pipe(Effect.provide(makeTestLayer(homePath, services)))
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

describe("sync package references", () => {
  it("leaves matching dependency entries and manual entries unchanged without registry work", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    const dependencyEntry = makeEntry("example", "1.0.0")
    const manualEntry = makeEntry("manual", "3.0.0", "manual")
    let metadataRequests = 0

    await initializeProject(projectPath, { example: "^1.0.0" }, [manualEntry, dependencyEntry])
    await materializeReference(projectPath, dependencyEntry)
    const { result } = await runSync(projectPath, homePath, {
      exactVersions: { example: "1.0.0" },
      onMetadataRequest: () => {
        metadataRequests += 1
      },
    })

    expect(result.unchanged).toEqual([dependencyEntry])
    expect(result.updated).toEqual([])
    expect(result.removed).toEqual([])
    expect(metadataRequests).toBe(0)
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )
    expect(lockfile.packages).toEqual([manualEntry, dependencyEntry])
  })

  it("materializes a new exact version before removing the stale reference", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    const oldEntry = makeEntry("example", "1.0.0")
    const oldReferencePath = await materializeReference(projectPath, oldEntry)

    await initializeProject(projectPath, { example: "^2.0.0" }, [oldEntry])
    const { preparation, result } = await runSync(projectPath, homePath, {
      exactVersions: { example: "2.0.0" },
      metadata: { example: makeMetadata("example", ["2.0.0"]) },
    })

    expect(preparation.updates[0]).toMatchObject({
      previous: [oldEntry],
      resolution: {
        resolvedPackage: {
          identity: { name: "example", registry: "npm", version: "2.0.0" },
        },
      },
      type: "materialize",
    })
    expect(result.updated).toHaveLength(1)
    expect(result.updated[0]?.current.version).toBe("2.0.0")
    expect(result.updated[0]?.previous).toEqual([oldEntry])
    expect(await exists(oldReferencePath)).toBe(false)
    const newReferencePath = getReferencePath(projectPath, makeEntry("example", "2.0.0"))
    expect(await readFile(join(newReferencePath, "SOURCE.md"), "utf8")).toBe("new source")
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )
    expect(lockfile.packages).toEqual([
      expect.objectContaining({ name: "example", tracking: "dependency", version: "2.0.0" }),
    ])
  })

  it("removes dependency entries absent from the manifest and preserves manual entries", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    const removedEntry = makeEntry("removed", "1.0.0")
    const manualEntry = makeEntry("manual", "2.0.0", "manual")

    await initializeProject(projectPath, {}, [removedEntry, manualEntry])
    const { result } = await runSync(projectPath, homePath)

    expect(result.removed).toEqual([removedEntry])
    expect(result.missingEntries).toEqual([removedEntry])
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )
    expect(lockfile.packages).toEqual([manualEntry])
  })

  it("preserves extra manual versions of a dependency while updating its tracked version", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    const oldEntry = makeEntry("example", "1.0.0")
    const manualEntry = makeEntry("example", "3.0.0", "manual")

    await initializeProject(projectPath, { example: "^2.0.0" }, [oldEntry, manualEntry])
    const { result } = await runSync(projectPath, homePath, {
      exactVersions: { example: "2.0.0" },
      metadata: { example: makeMetadata("example", ["2.0.0"]) },
    })
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )

    expect(result.updated).toHaveLength(1)
    expect(lockfile.packages).toEqual([
      manualEntry,
      expect.objectContaining({ name: "example", tracking: "dependency", version: "2.0.0" }),
    ])
  })

  it("preserves a manual reference already at the dependency target version", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    const oldEntry = makeEntry("example", "1.0.0")
    const manualTargetEntry = makeEntry("example", "2.0.0", "manual")
    const oldReferencePath = await materializeReference(projectPath, oldEntry)
    const manualReferencePath = await materializeReference(projectPath, manualTargetEntry)

    await initializeProject(projectPath, { example: "^2.0.0" }, [oldEntry, manualTargetEntry])
    const { preparation, result } = await runSync(projectPath, homePath, {
      exactVersions: { example: "2.0.0" },
    })

    expect(preparation.updates).toEqual([
      {
        current: manualTargetEntry,
        manifestRange: undefined,
        previous: [oldEntry],
        type: "remove-stale",
      },
    ])
    expect(result.updated[0]?.current).toEqual(manualTargetEntry)
    expect(await exists(oldReferencePath)).toBe(false)
    expect(await exists(manualReferencePath)).toBe(true)

    await writeFile(join(projectPath, "package.json"), JSON.stringify({ dependencies: {} }))
    await runSync(projectPath, homePath)

    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )
    expect(lockfile.packages).toEqual([manualTargetEntry])
    expect(await exists(manualReferencePath)).toBe(true)
  })

  it("rematerializes a missing reference at the manifest exact version", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    const entry = makeEntry("example", "1.0.0")
    const referencePath = getReferencePath(projectPath, entry)

    await initializeProject(projectPath, { example: "^1.0.0" }, [entry])
    const { preparation, result } = await runSync(projectPath, homePath, {
      exactVersions: { example: "1.0.0" },
      metadata: { example: makeMetadata("example", ["1.0.0"]) },
    })

    expect(preparation.updates[0]).toMatchObject({
      previous: [],
      tracking: "dependency",
      type: "materialize",
    })
    expect(result.unchanged).toEqual([])
    expect(result.updated[0]?.current).toEqual(entry)
    expect(await readFile(join(referencePath, "SOURCE.md"), "utf8")).toBe("new source")
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )
    expect(lockfile.packages).toEqual([entry])
  })

  it("ignores unreferenced manifest dependencies without registry work", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    let metadataRequests = 0

    await initializeProject(projectPath, { example: "^1.0.0" }, [])
    const { preparation, result } = await runSync(projectPath, homePath, {
      exactVersions: { example: "1.0.0" },
      onMetadataRequest: () => {
        metadataRequests += 1
      },
    })

    expect(preparation.updates).toEqual([])
    expect(preparation.removals).toEqual([])
    expect(result.updated).toEqual([])
    expect(result.removed).toEqual([])
    expect(metadataRequests).toBe(0)
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )
    expect(lockfile.packages).toEqual([])
  })

  it("preserves a manual reference when the same package is a manifest dependency", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    const manualEntry = makeEntry("example", "3.0.0", "manual")

    await initializeProject(projectPath, { example: "^1.0.0" }, [manualEntry])
    const { preparation, result } = await runSync(projectPath, homePath, {
      exactVersions: { example: "1.0.0" },
    })

    expect(preparation.updates).toEqual([])
    expect(preparation.removals).toEqual([])
    expect(result.updated).toEqual([])
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )
    expect(lockfile.packages).toEqual([manualEntry])
  })

  it("uses registry range resolution only when no installed version is available", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    const oldEntry = makeEntry("example", "1.0.0")

    await initializeProject(projectPath, { example: "^2.0.0" }, [oldEntry])
    const { result } = await runSync(projectPath, homePath, {
      metadata: { example: makeMetadata("example", ["1.0.0", "2.0.0"]) },
    })

    expect(result.updated[0]?.current.version).toBe("2.0.0")
    expect(result.updated[0]?.manifestRange).toBe("^2.0.0")
  })

  it("preserves registry fallback metadata when only stale references are removed", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    const oldEntry = makeEntry("example", "1.0.0")
    const targetEntry = makeEntry("example", "2.0.0")

    await initializeProject(projectPath, { example: "^2.0.0" }, [oldEntry, targetEntry])
    await materializeReference(projectPath, oldEntry)
    await materializeReference(projectPath, targetEntry)
    const { preparation, result } = await runSync(projectPath, homePath, {
      metadata: { example: makeMetadata("example", ["1.0.0", "2.0.0"]) },
    })

    expect(preparation.updates).toEqual([
      {
        current: targetEntry,
        manifestRange: "^2.0.0",
        previous: [oldEntry],
        type: "remove-stale",
      },
    ])
    expect(result.updated[0]?.manifestRange).toBe("^2.0.0")
  })

  it("keeps the old reference and lockfile entry when replacement fetching fails", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    const oldEntry = makeEntry("example", "1.0.0")
    const oldReferencePath = await materializeReference(projectPath, oldEntry)

    await initializeProject(projectPath, { example: "^2.0.0" }, [oldEntry])

    let failed = false

    try {
      await runSync(projectPath, homePath, {
        exactVersions: { example: "2.0.0" },
        metadata: { example: makeMetadata("example", ["2.0.0"]) },
        tarballStatus: 500,
      })
    } catch {
      failed = true
    }

    expect(failed).toBe(true)
    expect(await exists(oldReferencePath)).toBe(true)
    const lockfile = JSON.parse(
      await readFile(join(projectPath, ".packref", "packref-lock.json"), "utf8")
    )
    expect(lockfile.packages).toEqual([oldEntry])
  })

  it("fails for an initialized project with no supported manifest", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    await mkdir(join(projectPath, ".packref"))
    await writeFile(join(projectPath, ".packref", "packref-lock.json"), '{"packages":[]}')

    const failure = Effect.flip(preparePackageReferenceSync({ projectPath })).pipe(
      Effect.provide(makeTestLayer(homePath))
    )

    expect(await Effect.runPromise(failure)).toBeInstanceOf(UnsupportedManifestError)
  })

  it("fails for an uninitialized project", async () => {
    const projectPath = await makeTempDirectory()
    const homePath = await makeTempDirectory()
    await writeFile(join(projectPath, "package.json"), JSON.stringify({}))

    const failure = Effect.flip(preparePackageReferenceSync({ projectPath })).pipe(
      Effect.provide(makeTestLayer(homePath))
    )

    expect(await Effect.runPromise(failure)).toBeInstanceOf(NotInitializedError)
  })
})
