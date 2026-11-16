import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Prompt from "effect/cli/Prompt"
import * as Effect from "effect/Effect"
import { applyProjectCleanPlan, discoverProjectCleanPlan } from "#lib/references/clean.ts"
import { cleanStore } from "#lib/store/index.ts"
import * as Output from "#terminal/output.ts"
import { printTitle } from "#terminal/title.ts"

const global = Flag.Boolean("global").pipe(
  Flag.withDefault(false),
  Flag.withAlias("g"),
  Flag.withDescription("Remove all entries from the global Packref store")
)

const cleanGlobalStore = Effect.fn("cleanGlobalStore")(function* () {
  const shouldClean = yield* Prompt.Confirm({
    initial: false,
    message: "Remove all entries from the global Packref store?",
  })

  if (!shouldClean) {
    yield* Output.outro("Global store was not cleaned")

    return
  }

  const removedEntryCount = yield* cleanStore()
  yield* Output.success("Finished cleaning the global store")

  yield* Output.outro(
    removedEntryCount === 0
      ? "No global store entries found"
      : `Removed ${removedEntryCount} global store entr${removedEntryCount === 1 ? "y" : "ies"}`
  )
})

const cleanProject = Effect.fn("cleanProject")(function* () {
  const plan = yield* discoverProjectCleanPlan()

  const shouldClean = yield* Prompt.Confirm({
    initial: false,
    message: "Remove all package references from this project?",
  })

  if (!shouldClean) {
    yield* Output.outro("Project references were not cleaned")

    return
  }

  const removedEntryCount = yield* applyProjectCleanPlan(plan)
  yield* Output.success("Finished cleaning project references")

  yield* Output.outro(
    removedEntryCount === 0
      ? "No project references found"
      : `Removed ${removedEntryCount} project reference${removedEntryCount === 1 ? "" : "s"}`
  )
})

export default Command.make("clean", { global }).pipe(
  Command.withDescription("Clear current-project references or the entire global store"),
  Command.withHandler(({ global }) =>
    Effect.gen(function* () {
      yield* printTitle
      yield* Output.intro(`🧹 packref clean${global ? " --global" : ""}`)
      yield* global ? cleanGlobalStore() : cleanProject()
    }).pipe(
      Effect.catchTag("QuitError", () => Output.cancel("You've cancelled the clean process."))
    )
  )
)
