import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import type { ParsedPackageSpec } from "#lib/core/packages.ts"
import type { ManifestDependency } from "#lib/manifests/manifest.ts"
import type { ResolvedPackageReference } from "#lib/registries/registry.ts"
import { readProjectDependencies } from "#lib/manifests/index.ts"
import { resolvePackageReference } from "#lib/registries/index.ts"
import { fetchRepositorySnapshot } from "#lib/sources/repository/fetch.ts"
import { resolveRepositoryRef } from "#lib/sources/repository/normalize.ts"
import { fetchTarballSnapshot } from "#lib/sources/tarball/fetch.ts"
import { registerProject } from "#lib/workspace/config.ts"
import {
  initializeLockfile,
  listPackageEntries,
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

export interface AddPackageCandidates {
  readonly dependencies: readonly ManifestDependency[]
  readonly projectPath: string
}

export interface ResolvedPackageCandidateReference {
  readonly manifestRange: string | undefined
  readonly resolvedPackage: ResolvedPackageReference
}

const getRegistrySpecifier = (specifier: string) =>
  specifier.startsWith("workspace:") ? specifier.slice("workspace:".length) || "*" : specifier

const initializeAddProject = Effect.fn("initializeAddProject")(function* (
  options: AddPackageOptions
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const requestedProjectPath = Predicate.isUndefined(options.projectPath)
    ? path.resolve()
    : path.resolve(options.projectPath)
  const projectPath = yield* fs.realPath(requestedProjectPath)

  yield* ensureDirectory(projectPath)
  const lockfile = yield* initializeLockfile(projectPath)
  yield* registerProject(projectPath)

  return {
    lockfile,
    projectPath,
  }
})

export const findAddPackageCandidates = Effect.fn("findAddPackageCandidates")(function* (
  options: AddPackageOptions = {}
) {
  const { lockfile, projectPath } = yield* initializeAddProject(options)

  const referencedPackages = new Set(
    listPackageEntries(lockfile).map((entry) => `${entry.registry}:${entry.name}`)
  )
  const dependencies = (yield* readProjectDependencies(projectPath))
    .filter((dependency) => !referencedPackages.has(`${dependency.registry}:${dependency.name}`))
    .toSorted((left, right) => Order.String(left.name, right.name))

  return {
    dependencies,
    projectPath,
  } satisfies AddPackageCandidates
})

const materializePackageReferenceToProject = Effect.fn("materializePackageReferenceToProject")(
  function* (
    resolvedPackage: ResolvedPackageReference,
    projectPath: string,
    manifestRange: string | undefined,
    tracking: PackageEntry["tracking"]
  ) {
    const resolvedRepository = Predicate.isUndefined(resolvedPackage.repository)
      ? undefined
      : yield* resolveRepositoryRef(resolvedPackage.identity, resolvedPackage.repository).pipe(
          Effect.catchTags({
            // Ignore repository resolution errors, since the package may be a tarball or registry package
            InvalidRepositoryUrlError: () => Effect.succeed(void 0),
            TagNotFoundError: () => Effect.succeed(void 0),
            UnsupportedRepositoryHostError: () => Effect.succeed(void 0),
          })
        )

    const storeEntry = yield* Predicate.isUndefined(resolvedRepository)
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
      tracking,
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
  }
)

const addPackageReferenceToProject = Effect.fn("addPackageReferenceToProject")(function* (
  inputSpec: ParsedPackageSpec,
  projectPath: string,
  manifestDependency: ManifestDependency | undefined
) {
  const manifestRange =
    Predicate.isNotUndefined(manifestDependency) &&
    Predicate.isUndefined(manifestDependency.exactVersion)
      ? getRegistrySpecifier(manifestDependency.specifier)
      : undefined
  const resolutionSpec = Predicate.isUndefined(manifestDependency)
    ? inputSpec
    : {
        ...inputSpec,
        specifier: manifestDependency.exactVersion ?? manifestRange,
      }
  const resolvedPackage = yield* resolvePackageReference(resolutionSpec)

  return yield* materializePackageReferenceToProject(
    resolvedPackage,
    projectPath,
    manifestRange,
    Predicate.isUndefined(manifestDependency) ? "manual" : "dependency"
  )
})

export const resolvePackageCandidateReference = Effect.fn("resolvePackageCandidateReference")(
  function* (dependency: ManifestDependency) {
    const manifestRange = Predicate.isUndefined(dependency.exactVersion)
      ? getRegistrySpecifier(dependency.specifier)
      : undefined
    const resolvedPackage = yield* resolvePackageReference({
      name: dependency.name,
      registry: dependency.registry,
      specifier: dependency.exactVersion ?? manifestRange,
    })

    return {
      manifestRange,
      resolvedPackage,
    } satisfies ResolvedPackageCandidateReference
  }
)

export const materializePackageCandidateReference = Effect.fn(
  "materializePackageCandidateReference"
)(function* (
  resolution: ResolvedPackageCandidateReference,
  projectPath: string,
  tracking: PackageEntry["tracking"] = "dependency"
) {
  return yield* materializePackageReferenceToProject(
    resolution.resolvedPackage,
    projectPath,
    resolution.manifestRange,
    tracking
  )
})

export const addPackageCandidateReference = Effect.fn("addPackageCandidateReference")(function* (
  dependency: ManifestDependency,
  projectPath: string
) {
  const resolution = yield* resolvePackageCandidateReference(dependency)

  return yield* materializePackageCandidateReference(resolution, projectPath)
})

export const addPackageReference = Effect.fn("addPackageReference")(function* (
  inputSpec: ParsedPackageSpec,
  options: AddPackageOptions = {}
) {
  const { projectPath } = yield* initializeAddProject(options)

  const manifestDependency = Predicate.isUndefined(inputSpec.specifier)
    ? (yield* readProjectDependencies(projectPath)).find(
        (dependency) => dependency.name === inputSpec.name
      )
    : undefined

  return yield* addPackageReferenceToProject(inputSpec, projectPath, manifestDependency)
})
