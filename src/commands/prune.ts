import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import type { PackageIdentity } from "#lib/core/packages.ts"
import { applyPrunePlan, discoverPrunePlan } from "#lib/references/prune.ts"
import { Prompter } from "#terminal/prompter.ts"
import { printTitle } from "#terminal/title.ts"

const formatIdentity = (identity: PackageIdentity) =>
  `${identity.registry}:${identity.name}@${identity.version}`

export default Command.make("prune").pipe(
  Command.withDescription("Remove global store entries unused by registered projects"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const prompter = yield* Prompter

      yield* printTitle()
      yield* prompter.intro("🧹 packref prune")

      const plan = yield* prompter.withSpinner(() => discoverPrunePlan(), {
        failure: "Failed to inspect the global store",
        start: "Finding unused global store entries...",
        success: "Finished inspecting the global store",
      })

      for (const warning of plan.warnings) {
        yield* prompter.log.warning(
          warning.type === "missing-lockfile"
            ? `Registered project at ${warning.projectPath} has no Packref lockfile; skipped it.`
            : `Registered project at ${warning.projectPath} has a malformed Packref lockfile; skipped it.`
        )
      }

      for (const staleProjectPath of plan.staleProjectPaths) {
        yield* prompter.log.warning(`Registered project at ${staleProjectPath} no longer exists.`)
      }

      const removeStaleProjects =
        plan.staleProjectPaths.length > 0
          ? yield* prompter.confirm({
              initialValue: false,
              message: `Remove ${plan.staleProjectPaths.length} stale project registration${plan.staleProjectPaths.length === 1 ? "" : "s"}?`,
            })
          : false

      const result = yield* prompter.withSpinner(() => applyPrunePlan(plan, removeStaleProjects), {
        failure: "Failed to prune the global store",
        start: "Removing unused global store entries...",
        success: "Finished pruning the global store",
      })

      for (const entry of result.removedEntries) {
        yield* prompter.log.success(`Removed ${formatIdentity(entry.identity)}`)
      }

      if (result.removedProjectPaths.length > 0) {
        yield* prompter.log.success(
          `Removed ${result.removedProjectPaths.length} stale project registration${result.removedProjectPaths.length === 1 ? "" : "s"}`
        )
      }

      yield* prompter.outro(
        plan.warnings.length > 0 || plan.staleProjectPaths.length > 0
          ? "Skipped pruning global store entries because not all registered projects could be inspected"
          : result.removedEntries.length === 0
            ? "No unused global store entries found"
            : `Pruned ${result.removedEntries.length} global store entr${result.removedEntries.length === 1 ? "y" : "ies"}`
      )
    }).pipe(
      Effect.catchTags({
        OperationCancelled: () =>
          Effect.gen(function* () {
            const prompter = yield* Prompter
            yield* prompter.cancel("You've cancelled the prune process.")
          }),
      })
    )
  )
)
