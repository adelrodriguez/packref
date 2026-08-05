import type * as PlatformError from "effect/PlatformError"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Filter from "effect/Filter"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import type { PackageIdentity } from "#lib/core/packages.ts"
import type { PackageSource } from "#lib/core/source.ts"
import { StoreCorruptedError } from "#lib/core/errors.ts"
import { PACKAGE_DIRECTORY_NAME } from "#lib/core/packages.ts"
import { PackageSourceSchema } from "#lib/core/source.ts"
import { PackrefHome } from "#lib/services/packref-home.ts"
import { formatJson } from "#lib/shared/json.ts"
import {
  getGlobalStorePath,
  getStoreEntryPaths as getPathsForStoreEntry,
} from "#lib/store/paths.ts"

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

  return yield* fs.exists(entryPath)
})

export const readStoreEntry = Effect.fn("readStoreEntry")(function* (identity: PackageIdentity) {
  const fs = yield* FileSystem.FileSystem
  const { entryPath, metadataPath } = yield* getStoreEntryPaths(identity)
  const rawMetadata = yield* fs.readFileString(metadataPath).pipe(
    Effect.mapError(
      (cause) =>
        new StoreCorruptedError({
          cause,
          path: entryPath,
        })
    )
  )
  const metadata = yield* Schema.decodeUnknownEffect(StoreEntryMetadataJsonSchema)(
    rawMetadata
  ).pipe(
    Effect.mapError(
      (cause) =>
        new StoreCorruptedError({
          cause,
          path: entryPath,
        })
    )
  )

  return {
    path: entryPath,
    source: metadata.source,
  } satisfies StoredEntry
})

const listDirectoryOrEmpty = Effect.fn("listDirectoryOrEmpty")(function* (directoryPath: string) {
  const fs = yield* FileSystem.FileSystem

  return yield* fs
    .readDirectory(directoryPath)
    .pipe(Effect.catchFilter(Filter.reason("PlatformError", "NotFound"), () => Effect.succeed([])))
})

export const listStoreEntries = Effect.fn("listStoreEntries")(function* () {
  const path = yield* Path.Path
  const home = yield* PackrefHome
  const storeRoot = getGlobalStorePath(path, home.path)
  const packagesRoot = path.join(storeRoot, PACKAGE_DIRECTORY_NAME)
  const registries = yield* listDirectoryOrEmpty(packagesRoot)
  const entries: StoreEntry[] = []

  for (const registry of registries) {
    const registryPath = path.join(packagesRoot, registry)
    const packageSegments = yield* listDirectoryOrEmpty(registryPath)

    for (const packageSegment of packageSegments) {
      const packageSegmentPath = path.join(registryPath, packageSegment)

      if (packageSegment.startsWith("@")) {
        const scopedPackages = yield* listDirectoryOrEmpty(packageSegmentPath)

        for (const packageName of scopedPackages) {
          const name = `${packageSegment}/${packageName}`
          const packagePath = path.join(packageSegmentPath, packageName)
          const versions = yield* listDirectoryOrEmpty(packagePath)

          for (const version of versions) {
            entries.push({
              identity: { name, registry, version },
              path: path.join(packagePath, version),
            })
          }
        }

        continue
      }

      const versions = yield* listDirectoryOrEmpty(packageSegmentPath)

      for (const version of versions) {
        entries.push({
          identity: {
            name: packageSegment,
            registry,
            version,
          },
          path: path.join(packageSegmentPath, version),
        })
      }
    }
  }

  return entries
})

export const cleanStore = Effect.fn("cleanStore")(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const home = yield* PackrefHome
  const storeRoot = getGlobalStorePath(path, home.path)
  const entryCount = yield* listStoreEntries().pipe(
    Effect.map((entries) => entries.length),
    Effect.orElseSucceed(() => 0)
  )

  yield* fs.remove(storeRoot, { force: true, recursive: true })

  return entryCount
})

export const removeStoreEntry = Effect.fn("removeStoreEntry")(function* (
  identity: PackageIdentity
) {
  const fs = yield* FileSystem.FileSystem
  const { entryPath, metadataPath } = yield* getStoreEntryPaths(identity)

  yield* fs.remove(entryPath, { force: true, recursive: true })
  yield* fs.remove(metadataPath, { force: true })
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
  const exists = yield* fs.exists(storePath)

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
