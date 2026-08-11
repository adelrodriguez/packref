import type * as PlatformError from "effect/PlatformError"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Filter from "effect/Filter"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import * as Semaphore from "effect/Semaphore"
import type { PackageSource } from "#lib/core/source.ts"
import { GlobalStoreFilesystemError, StoreCorruptedError } from "#lib/core/errors.ts"
import {
  packageIdentityOrder,
  PACKAGE_DIRECTORY_NAME,
  type PackageIdentity,
} from "#lib/core/packages.ts"
import { PackageSourceSchema } from "#lib/core/source.ts"
import { formatJson } from "#lib/shared/json.ts"
import {
  getGlobalStorePath,
  getStoreEntryPaths as getPathsForStoreEntry,
} from "#lib/store/paths.ts"
import { PackrefHome } from "#lib/workspace/home.ts"

export interface StoreEntry {
  readonly identity: PackageIdentity
  readonly path: string
}

export interface MaterializedStoreEntry {
  readonly path: string
  readonly reused: boolean
  readonly source: PackageSource
}

export interface StoredEntry {
  readonly path: string
  readonly source: PackageSource
}

const StoreEntryMetadataSchema = Schema.Struct({
  source: PackageSourceSchema,
})
const StoreEntryMetadataJsonSchema = Schema.fromJsonString(StoreEntryMetadataSchema)
const decodeStoreEntryMetadata = Schema.decodeUnknownEffect(StoreEntryMetadataJsonSchema)
const STORE_TRAVERSAL_CONCURRENCY = 16

const makeStoreCorruptedError = (path: string) => (cause: unknown) =>
  new StoreCorruptedError({ cause, path })

const makeStoreFilesystemError =
  (operation: GlobalStoreFilesystemError["operation"], path: string) => (cause: unknown) =>
    new GlobalStoreFilesystemError({ cause, operation, path })

const getStoreEntryPaths = Effect.fn("getStoreEntryPaths")(function* (identity: PackageIdentity) {
  const path = yield* Path.Path
  const home = yield* PackrefHome

  return yield* getPathsForStoreEntry(getGlobalStorePath(path, home.path), identity)
})

export const getStoreEntryPath = Effect.fn("getStoreEntryPath")(function* (
  identity: PackageIdentity
) {
  return (yield* getStoreEntryPaths(identity)).entryPath
})

export const hasStoreEntry = Effect.fn("hasStoreEntry")(function* (identity: PackageIdentity) {
  const fs = yield* FileSystem.FileSystem
  const entryPath = yield* getStoreEntryPath(identity)

  return yield* fs
    .exists(entryPath)
    .pipe(Effect.mapError(makeStoreFilesystemError("access", entryPath)))
})

export const readStoreEntry = Effect.fn("readStoreEntry")(function* (identity: PackageIdentity) {
  const fs = yield* FileSystem.FileSystem
  const { entryPath, metadataPath } = yield* getStoreEntryPaths(identity)
  const rawMetadata = yield* fs
    .readFileString(metadataPath)
    .pipe(Effect.mapError(makeStoreFilesystemError("access", metadataPath)))
  const metadata = yield* decodeStoreEntryMetadata(rawMetadata).pipe(
    Effect.mapError(makeStoreCorruptedError(entryPath))
  )

  return {
    path: entryPath,
    source: metadata.source,
  } satisfies StoredEntry
})

const listDirectoryOrEmpty = Effect.fn("listDirectoryOrEmpty")(function* (
  directoryPath: string,
  semaphore: Semaphore.Semaphore
) {
  const fs = yield* FileSystem.FileSystem

  return yield* semaphore.withPermit(fs.readDirectory(directoryPath)).pipe(
    Effect.catchFilter(Filter.reason("PlatformError", "NotFound"), () => Effect.succeed([])),
    Effect.mapError(makeStoreFilesystemError("list", directoryPath))
  )
})

export const listStoreEntries = Effect.fn("listStoreEntries")(function* () {
  const path = yield* Path.Path
  const home = yield* PackrefHome
  const storeRoot = getGlobalStorePath(path, home.path)
  const packagesRoot = path.join(storeRoot, PACKAGE_DIRECTORY_NAME)
  const semaphore = yield* Semaphore.make(STORE_TRAVERSAL_CONCURRENCY)
  const registries = yield* listDirectoryOrEmpty(packagesRoot, semaphore)
  const registryEntries = yield* Effect.forEach(
    registries,
    Effect.fn(function* (registry) {
      const registryPath = path.join(packagesRoot, registry)
      const packageSegments = yield* listDirectoryOrEmpty(registryPath, semaphore)

      const packageEntries = yield* Effect.forEach(
        packageSegments,
        Effect.fn(function* (packageSegment) {
          const packageSegmentPath = path.join(registryPath, packageSegment)

          if (packageSegment.startsWith("@")) {
            const scopedPackages = yield* listDirectoryOrEmpty(packageSegmentPath, semaphore)

            return yield* Effect.forEach(
              scopedPackages,
              Effect.fn(function* (packageName) {
                const name = `${packageSegment}/${packageName}`
                const packagePath = path.join(packageSegmentPath, packageName)
                const versions = yield* listDirectoryOrEmpty(packagePath, semaphore)

                return versions.map((version) => ({
                  identity: { name, registry, version },
                  path: path.join(packagePath, version),
                }))
              }),
              { concurrency: "unbounded" }
            ).pipe(Effect.map((entries) => entries.flat()))
          }

          const versions = yield* listDirectoryOrEmpty(packageSegmentPath, semaphore)

          return versions.map((version) => ({
            identity: {
              name: packageSegment,
              registry,
              version,
            },
            path: path.join(packageSegmentPath, version),
          }))
        }),
        { concurrency: "unbounded" }
      )

      return packageEntries.flat()
    }),
    { concurrency: "unbounded" }
  )

  return registryEntries
    .flat()
    .toSorted(Order.mapInput(packageIdentityOrder, (entry: StoreEntry) => entry.identity))
})

export const cleanStore = Effect.fn("cleanStore")(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const home = yield* PackrefHome
  const storeRoot = getGlobalStorePath(path, home.path)
  const entryCount = yield* listStoreEntries().pipe(
    Effect.map((entries) => entries.length),
    Effect.catchTag("GlobalStoreFilesystemError", () => Effect.succeed(0))
  )

  yield* fs
    .remove(storeRoot, { force: true, recursive: true })
    .pipe(Effect.mapError(makeStoreFilesystemError("clean", storeRoot)))

  return entryCount
})

export const removeStoreEntry = Effect.fn("removeStoreEntry")(function* (
  identity: PackageIdentity
) {
  const fs = yield* FileSystem.FileSystem
  const { entryPath, metadataPath } = yield* getStoreEntryPaths(identity)

  yield* fs
    .remove(entryPath, { force: true, recursive: true })
    .pipe(Effect.mapError(makeStoreFilesystemError("remove", entryPath)))
  yield* fs
    .remove(metadataPath, { force: true })
    .pipe(Effect.mapError(makeStoreFilesystemError("remove", metadataPath)))
})

export const materializeStoreEntry = Effect.fn("materializeStoreEntry")(function* <E, R>(
  identity: PackageIdentity,
  source: PackageSource,
  materialize: (temporaryPath: string) => Effect.Effect<void, E, R>,
  mapPlatformError: (cause: PlatformError.PlatformError) => E
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const { entryPath: storePath, metadataPath } = yield* getStoreEntryPaths(identity)
  const exists = yield* fs.exists(storePath).pipe(Effect.mapError(mapPlatformError))

  if (exists) {
    const storedEntry = yield* readStoreEntry(identity)

    return {
      path: storePath,
      reused: true,
      source: storedEntry.source,
    } satisfies MaterializedStoreEntry
  }

  const parentPath = path.dirname(storePath)
  yield* fs.makeDirectory(parentPath, { recursive: true }).pipe(Effect.mapError(mapPlatformError))
  const encodedMetadata = formatJson(
    yield* Schema.encodeEffect(StoreEntryMetadataJsonSchema)({ source })
  )

  return yield* Effect.scoped(
    Effect.gen(function* () {
      const temporaryRootPath = yield* fs
        .makeTempDirectoryScoped({
          directory: parentPath,
          prefix: ".packref-",
        })
        .pipe(Effect.mapError(mapPlatformError))
      const temporaryPath = path.join(temporaryRootPath, "entry")

      yield* fs.makeDirectory(temporaryPath).pipe(Effect.mapError(mapPlatformError))

      yield* materialize(temporaryPath)

      const metadataParentPath = path.dirname(metadataPath)
      yield* fs
        .makeDirectory(metadataParentPath, { recursive: true })
        .pipe(Effect.mapError(mapPlatformError))
      yield* Effect.scoped(
        Effect.gen(function* () {
          const temporaryMetadataPath = yield* fs
            .makeTempFileScoped({
              directory: temporaryPath,
              prefix: ".packref-store-",
              suffix: ".json",
            })
            .pipe(Effect.mapError(mapPlatformError))

          yield* fs
            .writeFileString(temporaryMetadataPath, encodedMetadata)
            .pipe(Effect.mapError(mapPlatformError))
          yield* fs.remove(metadataPath, { force: true }).pipe(Effect.mapError(mapPlatformError))
          yield* fs
            .rename(temporaryMetadataPath, metadataPath)
            .pipe(Effect.mapError(mapPlatformError))
        })
      )
      yield* fs.rename(temporaryPath, storePath).pipe(
        Effect.mapError(mapPlatformError),
        Effect.tapError(() => fs.remove(metadataPath, { force: true }).pipe(Effect.ignore))
      )

      return {
        path: storePath,
        reused: false,
        source,
      } satisfies MaterializedStoreEntry
    })
  )
})
