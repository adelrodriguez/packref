import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import type { PackageIdentity } from "#lib/core/packages.ts"
import { getPackageIdentitySegments } from "#lib/logic/packages.ts"
import { GLOBAL_DIRECTORY_SEGMENTS } from "#lib/workspace/paths.ts"

export const STORE_DIRECTORY_NAME = "store"
export const STORE_METADATA_DIRECTORY_NAME = ".metadata"

export const getGlobalStorePath = (path: Path.Path, home: string) =>
  path.join(home, ...GLOBAL_DIRECTORY_SEGMENTS, STORE_DIRECTORY_NAME)

export const getStorePackagePath = Effect.fn("getStorePackagePath")(function* (
  storeRoot: string,
  identity: PackageIdentity
) {
  const path = yield* Path.Path
  const segments = yield* getPackageIdentitySegments(identity)

  return path.join(storeRoot, ...segments)
})

export const getStoreEntryPaths = Effect.fn("getStoreEntryPaths")(function* (
  storeRoot: string,
  identity: PackageIdentity
) {
  const path = yield* Path.Path
  const segments = yield* getPackageIdentitySegments(identity)

  return {
    entryPath: path.join(storeRoot, ...segments),
    metadataPath: path.join(
      storeRoot,
      STORE_METADATA_DIRECTORY_NAME,
      ...segments.slice(0, -1),
      `${identity.version}.json`
    ),
  }
})
