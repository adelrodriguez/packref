import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Filter from "effect/Filter"
import * as Order from "effect/Order"
import { packageIdentityOrder, type PackageIdentity } from "#lib/core/packages.ts"
import { listStoreEntries, removeStoreEntry, type StoreEntry } from "#lib/store/store.ts"
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

export const discoverPrunePlan = Effect.fn("discoverPrunePlan")(function* () {
  const fs = yield* FileSystem.FileSystem
  const config = yield* initializeGlobalConfig()
  const referencedIdentities = new Set<string>()
  const staleProjectPaths: string[] = []
  const warnings: ProjectLockfileWarning[] = []

  for (const projectPath of config.projects) {
    const projectExists = yield* fs.exists(projectPath)

    if (!projectExists || (yield* fs.stat(projectPath)).type !== "Directory") {
      staleProjectPaths.push(projectPath)
      continue
    }

    const lockfileResult = yield* readProjectLockfile(projectPath).pipe(
      Effect.map((lockfile) => ({ lockfile, type: "success" }) as const),
      Effect.catchTag("LockfileParseError", () =>
        Effect.succeed({ type: "malformed-lockfile" } as const)
      ),
      Effect.catchFilter(Filter.reason("PlatformError", "NotFound"), () =>
        Effect.succeed({ type: "missing-lockfile" } as const)
      )
    )

    if (lockfileResult.type !== "success") {
      warnings.push({
        projectPath,
        type: lockfileResult.type,
      })
      continue
    }

    for (const entry of lockfileResult.lockfile.packages) {
      referencedIdentities.add(identityKey(entry))
    }
  }

  const storeEntries =
    warnings.length === 0 && staleProjectPaths.length === 0
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
  const storeEntries =
    plan.warnings.length === 0 && plan.staleProjectPaths.length === 0 ? plan.storeEntries : []

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
