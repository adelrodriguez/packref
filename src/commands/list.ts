import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"

export default Command.make("list").pipe(
  Command.withDescription("List all referenced packages in the project"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      yield* Effect.log("TODO: Read lockfile and print all referenced packages")
    })
  )
)
