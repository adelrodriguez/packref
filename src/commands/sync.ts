import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import { formatPackageIdentity } from "#lib/core/identity.ts"
import {
  preparePackageReferenceSync,
  syncPackageReferences,
  type SyncPlan,
  type SyncResult,
} from "#lib/references/sync.ts"
import * as Output from "#terminal/output.ts"
import { printTitle } from "#terminal/title.ts"

const reportSyncPlan = Effect.fn("reportSyncPlan")(function* (plan: SyncPlan) {
  if (plan.updates.length > 0) {
    yield* Output.info("The following package references will be updated:")
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
            Output.info(
              `  ${target.registry}:${target.name} ${previous.version} → ${target.version}`
            ),
          { discard: true }
        )
      },
      { discard: true }
    )
  }

  if (plan.removals.length > 0) {
    yield* Output.info("The following package references will be removed:")
    yield* Effect.forEach(
      plan.removals,
      (entry) => Output.info(`  ${formatPackageIdentity(entry)}`),
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

  yield* Output.warning(
    `${name} has no installed version; resolved ${range} -> ${version} from the registry.`
  )
})

const reportSyncResult = Effect.fn("reportSyncResult")(function* (result: SyncResult) {
  yield* Effect.forEach(
    result.missingEntries,
    (entry) =>
      Output.warning(
        `Reference directory for ${formatPackageIdentity(entry)} was already missing; removed its lockfile entry.`
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
        yield* Output.success(`Updated ${formatPackageIdentity(change.current)}`)
      }),
    { discard: true }
  )

  yield* Effect.forEach(
    result.removed,
    (entry) => Output.success(`Removed ${formatPackageIdentity(entry)}`),
    { discard: true }
  )

  if (result.updated.length === 0 && result.removed.length === 0) {
    yield* Output.info(
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
      yield* printTitle
      yield* Output.intro("🔄 packref sync")

      const preparation = yield* preparePackageReferenceSync()
      yield* Output.success("Resolved project dependencies")

      yield* reportSyncPlan(preparation)

      const result = yield* syncPackageReferences(preparation)
      yield* Output.success("Synced package references")
      const changedCount = yield* reportSyncResult(result)

      yield* Output.outro(
        changedCount === 0
          ? "Package references already synchronized"
          : `Synchronized ${changedCount} package reference${changedCount === 1 ? "" : "s"}`
      )
    })
  )
)
