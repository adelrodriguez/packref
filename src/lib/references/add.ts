import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import type { ParsedPackageSpec } from "#lib/core/packages.ts"
import { readProjectDependencies } from "#lib/manifests/index.ts"
import { resolvePackageReference } from "#lib/registries/index.ts"
import { fetchRepositorySnapshot } from "#lib/sources/repository/fetch.ts"
import { resolveRepositoryRef } from "#lib/sources/repository/normalize.ts"
import { fetchTarballSnapshot } from "#lib/sources/tarball/fetch.ts"
import { registerProject } from "#lib/workspace/config.ts"
import {
  initializeLockfile,
  upsertPackageEntry,
  type PackageEntry,
} from "#lib/workspace/lockfile.ts"
import { createProjectReference, ensureDirectory } from "#lib/workspace/project.ts"

export interface AddPackageOptions {
  readonly projectPath?: string
}

export interface AddPackageResult {
  readonly entry: PackageEntry
  /**
   * Set when the package is a manifest dependency with no installed version (no lockfile entry or
   * `node_modules` copy), so its manifest range was resolved against the registry instead. Holds
   * the range specifier.
   */
  readonly manifestRange: string | undefined
  readonly projectPath: string
  readonly referencePath: string
  readonly reusedStoreEntry: boolean
  readonly storePath: string
}

const getRegistrySpecifier = (specifier: string) =>
  specifier.startsWith("workspace:") ? specifier.slice("workspace:".length) || "*" : specifier

export const addPackageReference = Effect.fn("addPackageReference")(function* (
  inputSpec: ParsedPackageSpec,
  options: AddPackageOptions = {}
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const requestedProjectPath =
    options.projectPath === undefined ? path.resolve() : path.resolve(options.projectPath)
  const projectPath = yield* fs.realPath(requestedProjectPath)

  yield* ensureDirectory(projectPath)
  yield* initializeLockfile(projectPath)
  yield* registerProject(projectPath)

  const manifestDependency =
    inputSpec.specifier === undefined
      ? (yield* readProjectDependencies(projectPath)).find(
          (dependency) => dependency.name === inputSpec.name
        )
      : undefined
  const manifestRange =
    manifestDependency !== undefined && manifestDependency.exactVersion === undefined
      ? getRegistrySpecifier(manifestDependency.specifier)
      : undefined
  const resolutionSpec =
    manifestDependency === undefined
      ? inputSpec
      : {
          ...inputSpec,
          specifier: manifestDependency.exactVersion ?? manifestRange,
        }
  const resolvedPackage = yield* resolvePackageReference(resolutionSpec)
  const resolvedRepository =
    resolvedPackage.repository === undefined
      ? undefined
      : yield* resolveRepositoryRef(resolvedPackage.identity, resolvedPackage.repository).pipe(
          Effect.catchTags({
            // Ignore repository resolution errors, since the package may be a tarball or registry package
            InvalidRepositoryUrlError: () => Effect.succeed(void 0),
            TagNotFoundError: () => Effect.succeed(void 0),
            UnsupportedRepositoryHostError: () => Effect.succeed(void 0),
          })
        )

  const storeEntry = yield* resolvedRepository === undefined
    ? fetchTarballSnapshot(resolvedPackage.identity, resolvedPackage.tarballUrl)
    : fetchRepositorySnapshot(resolvedPackage.identity, resolvedRepository)

  const referencePath = yield* createProjectReference(
    projectPath,
    resolvedPackage.identity,
    storeEntry.path,
    storeEntry.source
  )
  const entry = {
    ...resolvedPackage.identity,
    source: storeEntry.source,
    tracking: manifestDependency === undefined ? "manual" : "dependency",
  } satisfies PackageEntry

  yield* upsertPackageEntry(projectPath, entry)

  return {
    entry,
    manifestRange,
    projectPath,
    referencePath,
    reusedStoreEntry: storeEntry.reused,
    storePath: storeEntry.path,
  } satisfies AddPackageResult
})
