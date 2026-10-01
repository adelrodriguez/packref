import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import type { PackageIdentity } from "#lib/core/identity.ts"
import { getPackageIdentitySegments } from "#lib/core/packages.ts"

export const PACKREF_DIRECTORY_NAME = ".packref"
export const LOCKFILE_NAME = "packref-lock.json"
export const GLOBAL_DIRECTORY_SEGMENTS = [".agents", "packref"] as const
export const GLOBAL_CONFIG_NAME = "config.json"

export const getDirectoryPath = (path: Path.Path, projectPath: string) =>
  path.join(projectPath, PACKREF_DIRECTORY_NAME)

export const getProjectLockfilePath = (path: Path.Path, projectPath: string) =>
  path.join(getDirectoryPath(path, projectPath), LOCKFILE_NAME)

export const getGlobalDirectoryPath = (path: Path.Path, home: string) =>
  path.join(home, ...GLOBAL_DIRECTORY_SEGMENTS)

export const getGlobalConfigPath = (path: Path.Path, home: string) =>
  path.join(getGlobalDirectoryPath(path, home), GLOBAL_CONFIG_NAME)

export const getPackageIdentityPath = Effect.fn("getPackageIdentityPath")(function* (
  root: string,
  identity: PackageIdentity
) {
  const path = yield* Path.Path
  const segments = yield* getPackageIdentitySegments(identity)

  return path.join(root, ...segments)
})
