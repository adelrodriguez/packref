import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { UnsupportedManifestError } from "#lib/core/errors.ts"
import {
  packageCoordinatesEquivalence,
  packageCoordinatesOrder,
  packageIdentityEquivalence,
  type PackageCoordinates,
  type PackageIdentity,
} from "#lib/core/packages.ts"
import { getManifestAdapter } from "#lib/manifests/index.ts"
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

export const getSyncUpdateTarget = (update: SyncUpdate): PackageIdentity =>
  update.type === "materialize" ? update.resolution.resolvedPackage.identity : update.current

const packageReferenceExists = Effect.fn("sync.packageReferenceExists")(function* (
  projectPath: string,
  entry: PackageEntry
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const projectDirectoryPath = getDirectoryPath(path, projectPath)
  const referencePath = yield* getStorePackagePath(projectDirectoryPath, entry)

  return yield* fs.exists(referencePath)
})

export const preparePackageReferenceSync = Effect.fn("preparePackageReferenceSync")(function* (
  options: SyncPackageReferencesOptions = {}
) {
  const projectPath = yield* requireInitializedProject(options.projectPath)
  const adapter = yield* getManifestAdapter(projectPath)

  if (Option.isNone(adapter)) {
    return yield* new UnsupportedManifestError({ path: projectPath })
  }

  const dependencies = Array.sort(yield* adapter.value.read(projectPath), packageCoordinatesOrder)
  const lockfile = yield* readProjectLockfile(projectPath)
  const entries = listPackageEntries(lockfile)
  const manifestPackages = new Set(dependencies.map((dependency) => packageKey(dependency)))
  const removals = entries.filter(
    (entry) => entry.tracking === "dependency" && !manifestPackages.has(packageKey(entry))
  )
  const unchanged: PackageEntry[] = []
  const updates: SyncUpdate[] = []

  for (const dependency of dependencies) {
    const packageEntries = entries.filter((entry) =>
      packageCoordinatesEquivalence(entry, dependency)
    )
    const trackedEntries = packageEntries.filter((entry) => entry.tracking === "dependency")

    if (trackedEntries.length === 0) {
      continue
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
        updates.push({
          previous: staleEntries,
          resolution: yield* resolvePackageCandidateReference(dependency),
          tracking: exactMatch.tracking,
          type: "materialize",
        })
      } else if (staleEntries.length === 0) {
        unchanged.push(exactMatch)
      } else {
        updates.push({
          current: exactMatch,
          manifestRange: undefined,
          previous: staleEntries,
          type: "remove-stale",
        })
      }

      continue
    }

    const resolution = yield* resolvePackageCandidateReference(dependency)
    const current = packageEntries.find((entry) =>
      packageIdentityEquivalence(entry, resolution.resolvedPackage.identity)
    )
    const staleEntries = trackedEntries.filter(
      (entry) => !packageIdentityEquivalence(entry, resolution.resolvedPackage.identity)
    )

    if (current === undefined || !(yield* packageReferenceExists(projectPath, current))) {
      updates.push({
        previous: staleEntries,
        resolution,
        tracking: current?.tracking ?? "dependency",
        type: "materialize",
      })
    } else if (staleEntries.length === 0) {
      unchanged.push(current)
    } else {
      updates.push({
        current,
        manifestRange: resolution.manifestRange,
        previous: staleEntries,
        type: "remove-stale",
      })
    }
  }

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
