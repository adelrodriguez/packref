import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import { Prompter } from "#lib/services/prompter.ts"

export default Command.make("prune").pipe(
  Command.withDescription("Remove unused entries from the global store"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const prompter = yield* Prompter

      yield* prompter.log.info(
        "TODO: Read global config, load project lockfiles, collect referenced packages, delete unused store directories"
      )
    })
  )
)
