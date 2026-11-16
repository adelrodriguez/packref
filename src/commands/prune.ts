import * as Command from "effect/cli/Command"
import * as Prompt from "effect/cli/Prompt"
import * as Effect from "effect/Effect"
import { formatPackageIdentity } from "#lib/core/identity.ts"
import { applyPrunePlan, discoverPrunePlan } from "#lib/references/prune.ts"
import * as Output from "#terminal/output.ts"
import { printTitle } from "#terminal/title.ts"

export default Command.make("prune").pipe(
  Command.withDescription("Remove global store entries unused by registered projects"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      yield* printTitle
      yield* Output.intro("🧹 packref prune")

      const plan = yield* discoverPrunePlan()
      yield* Output.success("Finished inspecting the global store")

      for (const warning of plan.warnings) {
        yield* Output.warning(
          warning.type === "missing-lockfile"
            ? `Registered project at ${warning.projectPath} has no Packref lockfile; skipped it.`
            : `Registered project at ${warning.projectPath} has a malformed Packref lockfile; skipped it.`
        )
      }

      for (const staleProjectPath of plan.staleProjectPaths) {
        yield* Output.warning(`Registered project at ${staleProjectPath} no longer exists.`)
      }

      const removeStaleProjects =
        plan.staleProjectPaths.length > 0
          ? yield* Prompt.Confirm({
              initial: false,
              message: `Remove ${plan.staleProjectPaths.length} stale project registration${plan.staleProjectPaths.length === 1 ? "" : "s"}?`,
            })
          : false

      const result = yield* applyPrunePlan(plan, removeStaleProjects)
      yield* Output.success("Finished pruning the global store")

      for (const entry of result.removedEntries) {
        yield* Output.success(`Removed ${formatPackageIdentity(entry.identity)}`)
      }

      if (result.removedProjectPaths.length > 0) {
        yield* Output.success(
          `Removed ${result.removedProjectPaths.length} stale project registration${result.removedProjectPaths.length === 1 ? "" : "s"}`
        )
      }

      yield* Output.outro(
        plan.warnings.length > 0 || plan.staleProjectPaths.length > 0
          ? "Skipped pruning global store entries because not all registered projects could be inspected"
          : result.removedEntries.length === 0
            ? "No unused global store entries found"
            : `Pruned ${result.removedEntries.length} global store entr${result.removedEntries.length === 1 ? "y" : "ies"}`
      )
    }).pipe(
      Effect.catchTag("QuitError", () => Output.cancel("You've cancelled the prune process."))
    )
  )
)
