import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import type { ManifestDependency } from "#lib/manifests/manifest.ts"
import { PackageReferenceFilesystemError, UnsupportedManifestError } from "#lib/core/errors.ts"
import {
  packageCoordinatesEquivalence,
  packageCoordinatesOrder,
  packageIdentityEquivalence,
  type PackageCoordinates,
} from "#lib/core/packages.ts"
import { ProjectDependencyReader } from "#lib/manifests/index.ts"
import {
  materializePackageCandidateReference,
  resolvePackageCandidateReference,
  type ResolvedPackageCandidateReference,
} from "#lib/references/add.ts"
import { removePackageReferences } from "#lib/references/remove.ts"
import { getStorePackagePath } from "#lib/store/paths.ts"
import { registerProject } from "#lib/workspace/config.ts"
import {
  listPackageEntries,
  readProjectLockfile,
  type PackageEntry,
} from "#lib/workspace/lockfile.ts"
import { getDirectoryPath } from "#lib/workspace/paths.ts"
import { requireInitializedProject } from "#lib/workspace/project.ts"

export interface SyncPackageReferencesOptions {
  readonly projectPath?: string
}

export interface SyncMaterializeUpdate {
  readonly previous: readonly PackageEntry[]
  readonly resolution: ResolvedPackageCandidateReference
  readonly tracking: PackageEntry["tracking"]
  readonly type: "materialize"
}

export interface SyncRemoveStaleUpdate {
  readonly current: PackageEntry
  readonly manifestRange: string | undefined
  readonly previous: readonly PackageEntry[]
  readonly type: "remove-stale"
}

export type SyncUpdate = SyncMaterializeUpdate | SyncRemoveStaleUpdate

export interface SyncPlan {
  readonly projectPath: string
  readonly removals: readonly PackageEntry[]
  readonly unchanged: readonly PackageEntry[]
  readonly updates: readonly SyncUpdate[]
}

export interface SyncPackageChange {
  readonly current: PackageEntry
  readonly manifestRange: string | undefined
  readonly previous: readonly PackageEntry[]
  readonly reusedStoreEntry: boolean | undefined
}

export interface SyncResult {
  readonly missingEntries: readonly PackageEntry[]
  readonly removed: readonly PackageEntry[]
  readonly unchanged: readonly PackageEntry[]
  readonly updated: readonly SyncPackageChange[]
}

const packageKey = (value: PackageCoordinates) => `${value.registry}:${value.name}`

const noPackageEntries: readonly PackageEntry[] = []
const SYNC_PREPARE_CONCURRENCY = 8

const packageReferenceExists = Effect.fn("sync.packageReferenceExists")(function* (
  projectPath: string,
  entry: PackageEntry
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const projectDirectoryPath = getDirectoryPath(path, projectPath)
  const referencePath = yield* getStorePackagePath(projectDirectoryPath, entry)

  return yield* fs.exists(referencePath).pipe(
    Effect.mapError(
      (cause) =>
        new PackageReferenceFilesystemError({
          cause,
          operation: "inspect",
          path: referencePath,
        })
    )
  )
})

type PreparedDependency =
  | { readonly type: "none" }
  | { readonly entry: PackageEntry; readonly type: "unchanged" }
  | { readonly type: "update"; readonly update: SyncUpdate }

const prepareDependency = Effect.fn("sync.prepareDependency")(function* (
  projectPath: string,
  entries: readonly PackageEntry[],
  dependency: ManifestDependency
) {
  const packageEntries = entries.filter((entry) => packageCoordinatesEquivalence(entry, dependency))
  const trackedEntries = packageEntries.filter((entry) => entry.tracking === "dependency")

  if (trackedEntries.length === 0) {
    return { type: "none" } satisfies PreparedDependency
  }

  const exactMatch =
    dependency.exactVersion === undefined
      ? undefined
      : packageEntries.find((entry) => entry.version === dependency.exactVersion)

  if (exactMatch !== undefined) {
    const staleEntries = trackedEntries.filter(
      (entry) => !packageIdentityEquivalence(entry, exactMatch)
    )

    if (!(yield* packageReferenceExists(projectPath, exactMatch))) {
      return {
        type: "update",
        update: {
          previous: staleEntries,
          resolution: yield* resolvePackageCandidateReference(dependency),
          tracking: exactMatch.tracking,
          type: "materialize",
        },
      } satisfies PreparedDependency
    }

    return staleEntries.length === 0
      ? ({ entry: exactMatch, type: "unchanged" } satisfies PreparedDependency)
      : ({
          type: "update",
          update: {
            current: exactMatch,
            manifestRange: undefined,
            previous: staleEntries,
            type: "remove-stale",
          },
        } satisfies PreparedDependency)
  }

  const resolution = yield* resolvePackageCandidateReference(dependency)
  const current = packageEntries.find((entry) =>
    packageIdentityEquivalence(entry, resolution.resolvedPackage.identity)
  )
  const staleEntries = trackedEntries.filter(
    (entry) => !packageIdentityEquivalence(entry, resolution.resolvedPackage.identity)
  )

  if (current === undefined || !(yield* packageReferenceExists(projectPath, current))) {
    return {
      type: "update",
      update: {
        previous: staleEntries,
        resolution,
        tracking: current?.tracking ?? "dependency",
        type: "materialize",
      },
    } satisfies PreparedDependency
  }

  return staleEntries.length === 0
    ? ({ entry: current, type: "unchanged" } satisfies PreparedDependency)
    : ({
        type: "update",
        update: {
          current,
          manifestRange: resolution.manifestRange,
          previous: staleEntries,
          type: "remove-stale",
        },
      } satisfies PreparedDependency)
})

export const preparePackageReferenceSync = Effect.fn("preparePackageReferenceSync")(function* (
  options: SyncPackageReferencesOptions = {}
) {
  const projectPath = yield* requireInitializedProject(options.projectPath)
  const projectDependencyReader = yield* ProjectDependencyReader
  const projectDependencies = yield* projectDependencyReader.readProjectDependencies(projectPath)

  if (Option.isNone(projectDependencies)) {
    return yield* new UnsupportedManifestError({ path: projectPath })
  }

  const dependencies = Array.sort(projectDependencies.value, packageCoordinatesOrder)
  const lockfile = yield* readProjectLockfile(projectPath)
  const entries = listPackageEntries(lockfile)
  const manifestPackages = new Set(dependencies.map((dependency) => packageKey(dependency)))
  const removals = entries.filter(
    (entry) => entry.tracking === "dependency" && !manifestPackages.has(packageKey(entry))
  )
  const preparedDependencies = yield* Effect.forEach(
    dependencies,
    (dependency) => prepareDependency(projectPath, entries, dependency),
    { concurrency: SYNC_PREPARE_CONCURRENCY }
  )
  const [unchanged, updates] = Array.partition(
    preparedDependencies.filter((prepared) => prepared.type !== "none"),
    (prepared) =>
      prepared.type === "update" ? Result.succeed(prepared.update) : Result.fail(prepared.entry)
  )

  return {
    projectPath,
    removals,
    unchanged,
    updates,
  } satisfies SyncPlan
})

const removeEntries = Effect.fn("sync.removeEntries")(function* (
  projectPath: string,
  entries: readonly PackageEntry[]
) {
  if (entries.length === 0) {
    return {
      missingEntries: noPackageEntries,
      removedEntries: noPackageEntries,
    }
  }

  return yield* removePackageReferences(projectPath, entries)
})

export const syncPackageReferences = Effect.fn("syncPackageReferences")(function* (plan: SyncPlan) {
  const missingEntries: PackageEntry[] = []
  const updated: SyncPackageChange[] = []

  yield* registerProject(plan.projectPath)

  const removal = yield* removeEntries(plan.projectPath, plan.removals)

  missingEntries.push(...removal.missingEntries)

  for (const update of plan.updates) {
    if (update.type === "remove-stale") {
      const staleRemoval = yield* removeEntries(plan.projectPath, update.previous)

      missingEntries.push(...staleRemoval.missingEntries)
      updated.push({
        current: update.current,
        manifestRange: update.manifestRange,
        previous: update.previous,
        reusedStoreEntry: undefined,
      })
      continue
    }

    const materialized = yield* materializePackageCandidateReference(
      update.resolution,
      plan.projectPath,
      update.tracking
    )
    const staleRemoval = yield* removeEntries(plan.projectPath, update.previous)

    missingEntries.push(...staleRemoval.missingEntries)
    updated.push({
      current: materialized.entry,
      manifestRange: materialized.manifestRange,
      previous: update.previous,
      reusedStoreEntry: materialized.reusedStoreEntry,
    })
  }

  return {
    missingEntries,
    removed: removal.removedEntries,
    unchanged: plan.unchanged,
    updated,
  } satisfies SyncResult
})
