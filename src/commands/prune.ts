import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"

export default Command.make("prune").pipe(
  Command.withDescription("Remove unused entries from the global store"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      yield* Effect.log(
        "TODO: Read global config, load project lockfiles, collect referenced packages, delete unused store directories"
      )
    })
  )
)
