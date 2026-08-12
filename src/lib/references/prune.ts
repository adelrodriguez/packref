import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Filter from "effect/Filter"
import * as Order from "effect/Order"
import { ProjectFilesystemError } from "#lib/core/errors.ts"
import { packageIdentityOrder, type PackageIdentity } from "#lib/core/packages.ts"
import { listStoreEntries, removeStoreEntry, type StoreEntry } from "#lib/store/index.ts"
import { initializeGlobalConfig, unregisterProjects } from "#lib/workspace/config.ts"
import { readProjectLockfile } from "#lib/workspace/lockfile.ts"

export type ProjectLockfileWarning =
  | {
      readonly projectPath: string
      readonly type: "missing-lockfile"
    }
  | {
      readonly projectPath: string
      readonly type: "malformed-lockfile"
    }

export interface PrunePlan {
  readonly staleProjectPaths: readonly string[]
  /**
   * Store entries that are safe to remove. Empty when `warnings` or `staleProjectPaths` are
   * non-empty, because pruning is skipped unless every registered project could be inspected.
   * `applyPrunePlan` re-checks this condition before deleting, so an inconsistent plan cannot
   * remove entries.
   */
  readonly storeEntries: readonly StoreEntry[]
  readonly warnings: readonly ProjectLockfileWarning[]
}

export interface PruneResult {
  readonly removedEntries: readonly StoreEntry[]
  readonly removedProjectPaths: readonly string[]
}

const storeEntryOrder = Order.mapInput(packageIdentityOrder, (entry: StoreEntry) => entry.identity)
const projectLockfileWarningOrder = Order.mapInput(
  Order.String,
  (warning: ProjectLockfileWarning) => warning.projectPath
)

const identityKey = (identity: PackageIdentity) =>
  `${identity.registry}\u0000${identity.name}\u0000${identity.version}`

const canPruneStore = (plan: Pick<PrunePlan, "staleProjectPaths" | "warnings">) =>
  plan.warnings.length === 0 && plan.staleProjectPaths.length === 0

const PRUNE_SCAN_CONCURRENCY = 8

type ProjectScan =
  | { readonly projectPath: string; readonly type: "stale" }
  | { readonly identities: readonly string[]; readonly type: "success" }
  | { readonly projectPath: string; readonly type: ProjectLockfileWarning["type"] }

const scanRegisteredProject = Effect.fn("prune.scanRegisteredProject")(function* (
  projectPath: string
) {
  const fs = yield* FileSystem.FileSystem
  const projectExists = yield* fs
    .exists(projectPath)
    .pipe(
      Effect.mapError(
        (cause) => new ProjectFilesystemError({ cause, operation: "access", path: projectPath })
      )
    )

  if (!projectExists) {
    return { projectPath, type: "stale" } satisfies ProjectScan
  }

  const projectType = yield* fs.stat(projectPath).pipe(
    Effect.map((info) => info.type),
    Effect.catchFilter(Filter.reason("PlatformError", "NotFound"), () =>
      Effect.succeed("Missing" as const)
    ),
    Effect.mapError(
      (cause) => new ProjectFilesystemError({ cause, operation: "access", path: projectPath })
    )
  )

  if (projectType !== "Directory") {
    return { projectPath, type: "stale" } satisfies ProjectScan
  }

  const lockfileResult = yield* readProjectLockfile(projectPath).pipe(
    Effect.map((lockfile) => ({ lockfile, type: "success" }) as const),
    Effect.catchTag("LockfileParseError", () =>
      Effect.succeed({ type: "malformed-lockfile" } as const)
    ),
    Effect.catchFilter(Filter.reason("PlatformError", "NotFound"), () =>
      Effect.succeed({ type: "missing-lockfile" } as const)
    ),
    Effect.mapError(
      (cause) => new ProjectFilesystemError({ cause, operation: "access", path: projectPath })
    )
  )

  return lockfileResult.type === "success"
    ? ({
        identities: lockfileResult.lockfile.packages.map(identityKey),
        type: "success",
      } satisfies ProjectScan)
    : ({ projectPath, type: lockfileResult.type } satisfies ProjectScan)
})

export const discoverPrunePlan = Effect.fn("discoverPrunePlan")(function* () {
  const config = yield* initializeGlobalConfig()
  const scans = yield* Effect.forEach(config.projects, scanRegisteredProject, {
    concurrency: PRUNE_SCAN_CONCURRENCY,
  })
  const referencedIdentities = new Set(
    scans.flatMap((scan) => (scan.type === "success" ? scan.identities : []))
  )
  const staleProjectPaths = scans
    .filter((scan) => scan.type === "stale")
    .map((scan) => scan.projectPath)
  const warnings = scans.flatMap((scan): readonly ProjectLockfileWarning[] => {
    if (scan.type === "malformed-lockfile" || scan.type === "missing-lockfile") {
      return [{ projectPath: scan.projectPath, type: scan.type }]
    }

    return []
  })

  const storeEntries = canPruneStore({ staleProjectPaths, warnings })
    ? (yield* listStoreEntries())
        .filter((entry) => !referencedIdentities.has(identityKey(entry.identity)))
        .toSorted(storeEntryOrder)
    : []

  return {
    staleProjectPaths: staleProjectPaths.toSorted(Order.String),
    storeEntries,
    warnings: warnings.toSorted(projectLockfileWarningOrder),
  } satisfies PrunePlan
})

export const applyPrunePlan = Effect.fn("applyPrunePlan")(function* (
  plan: PrunePlan,
  removeStaleProjects: boolean
) {
  const storeEntries = canPruneStore(plan) ? plan.storeEntries : []

  yield* Effect.forEach(storeEntries, (entry) => removeStoreEntry(entry.identity), {
    discard: true,
  })

  if (removeStaleProjects && plan.staleProjectPaths.length > 0) {
    yield* unregisterProjects(plan.staleProjectPaths)
  }

  return {
    removedEntries: storeEntries,
    removedProjectPaths: removeStaleProjects ? plan.staleProjectPaths : [],
  } satisfies PruneResult
})
