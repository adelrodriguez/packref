import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import type { PackageIdentity } from "#lib/core/packages.ts"
import {
  preparePackageReferenceSync,
  syncPackageReferences,
  type SyncPlan,
  type SyncResult,
} from "#lib/references/sync.ts"
import { Prompter } from "#terminal/prompter.ts"
import { printTitle } from "#terminal/title.ts"

const formatIdentity = (identity: PackageIdentity) =>
  `${identity.registry}:${identity.name}@${identity.version}`

const reportSyncPlan = Effect.fn("reportSyncPlan")(function* (plan: SyncPlan) {
  const prompter = yield* Prompter

  if (plan.updates.length > 0) {
    yield* prompter.log.info("The following package references will be updated:")
    yield* Effect.forEach(
      plan.updates,
      (update) => {
        const target =
          update.type === "materialize"
            ? update.resolution.resolvedPackage.identity
            : update.current

        return Effect.forEach(
          update.previous,
          (previous) =>
            prompter.log.info(
              `  ${target.registry}:${target.name} ${previous.version} → ${target.version}`
            ),
          { discard: true }
        )
      },
      { discard: true }
    )
  }

  if (plan.removals.length > 0) {
    yield* prompter.log.info("The following package references will be removed:")
    yield* Effect.forEach(
      plan.removals,
      (entry) => prompter.log.info(`  ${formatIdentity(entry)}`),
      { discard: true }
    )
  }
})

const reportRegistryFallback = Effect.fn("reportSyncRegistryFallback")(function* (
  name: string,
  range: string | undefined,
  version: string
) {
  if (range === undefined) {
    return
  }

  const prompter = yield* Prompter
  yield* prompter.log.warning(
    `${name} has no installed version; resolved ${range} -> ${version} from the registry.`
  )
})

const reportSyncResult = Effect.fn("reportSyncResult")(function* (result: SyncResult) {
  const prompter = yield* Prompter

  yield* Effect.forEach(
    result.missingEntries,
    (entry) =>
      prompter.log.warning(
        `Reference directory for ${formatIdentity(entry)} was already missing; removed its lockfile entry.`
      ),
    { discard: true }
  )

  yield* Effect.forEach(
    result.updated,
    (change) =>
      Effect.gen(function* () {
        yield* reportRegistryFallback(
          change.current.name,
          change.manifestRange,
          change.current.version
        )
        yield* prompter.log.success(`Updated ${formatIdentity(change.current)}`)
      }),
    { discard: true }
  )

  yield* Effect.forEach(
    result.removed,
    (entry) => prompter.log.success(`Removed ${formatIdentity(entry)}`),
    { discard: true }
  )

  if (result.updated.length === 0 && result.removed.length === 0) {
    yield* prompter.log.info(
      result.unchanged.length === 0
        ? "No dependency-tracked references to update."
        : "All dependency-tracked references are up to date."
    )
  }

  return result.updated.length + result.removed.length
})

export default Command.make("sync").pipe(
  Command.withDescription("Update dependency-tracked references to resolved project versions"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const prompter = yield* Prompter

      yield* printTitle()
      yield* prompter.intro("🔄 packref sync")

      const preparation = yield* prompter.withSpinner(() => preparePackageReferenceSync(), {
        failure: "Failed to inspect project dependencies",
        start: "Resolving project dependencies...",
        success: "Resolved project dependencies",
      })

      yield* reportSyncPlan(preparation)

      const result = yield* prompter.withSpinner(() => syncPackageReferences(preparation), {
        failure: "Failed to sync package references",
        start: "Syncing package references...",
        success: "Synced package references",
      })
      const changedCount = yield* reportSyncResult(result)

      yield* prompter.outro(
        changedCount === 0
          ? "Package references already synchronized"
          : `Synchronized ${changedCount} package reference${changedCount === 1 ? "" : "s"}`
      )
    })
  )
)
