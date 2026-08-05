import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import { applyProjectCleanPlan, discoverProjectCleanPlan } from "#lib/references/clean.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { printTitle } from "#lib/shared/terminal.ts"
import { cleanStore } from "#lib/store/store.ts"

const global = Flag.boolean("global").pipe(
  Flag.withAlias("g"),
  Flag.withDescription("Remove all entries from the global Packref store")
)

const cleanGlobalStore = Effect.fn("cleanGlobalStore")(function* () {
  const prompter = yield* Prompter
  const shouldClean = yield* prompter.confirm({
    initialValue: false,
    message: "Remove all entries from the global Packref store?",
  })

  if (!shouldClean) {
    yield* prompter.outro("Global store was not cleaned")
    return
  }

  const removedEntryCount = yield* prompter.withSpinner(() => cleanStore(), {
    failure: "Failed to clean the global store",
    start: "Removing global store entries...",
    success: "Finished cleaning the global store",
  })

  yield* prompter.outro(
    removedEntryCount === 0
      ? "No global store entries found"
      : `Removed ${removedEntryCount} global store entr${removedEntryCount === 1 ? "y" : "ies"}`
  )
})

const cleanProject = Effect.fn("cleanProject")(function* () {
  const prompter = yield* Prompter
  const plan = yield* discoverProjectCleanPlan()
  const shouldClean = yield* prompter.confirm({
    initialValue: false,
    message: "Remove all package references from this project?",
  })

  if (!shouldClean) {
    yield* prompter.outro("Project references were not cleaned")
    return
  }

  const removedEntryCount = yield* prompter.withSpinner(() => applyProjectCleanPlan(plan), {
    failure: "Failed to clean project references",
    start: "Removing project references...",
    success: "Finished cleaning project references",
  })

  yield* prompter.outro(
    removedEntryCount === 0
      ? "No project references found"
      : `Removed ${removedEntryCount} project reference${removedEntryCount === 1 ? "" : "s"}`
  )
})

export default Command.make("clean", { global }).pipe(
  Command.withDescription("Remove project references or all global store entries"),
  Command.withHandler(({ global }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter

      yield* printTitle()
      yield* prompter.intro(`🧹 packref clean${global ? " --global" : ""}`)
      yield* global ? cleanGlobalStore() : cleanProject()
    }).pipe(
      Effect.catchTags({
        OperationCancelled: () =>
          Effect.gen(function* () {
            const prompter = yield* Prompter
            yield* prompter.cancel("You've cancelled the clean process.")
          }),
      })
    )
  )
)
