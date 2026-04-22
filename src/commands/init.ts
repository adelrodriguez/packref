import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"

export default Command.make("init").pipe(
  Command.withDescription("Initialize packref in the current project"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      yield* Effect.log(
        "TODO: Create .packref/ directory, empty lockfile, and register project in global config"
      )
    })
  )
)
