import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import { Prompter } from "#lib/services/prompter.ts"

export default Command.make("list").pipe(
  Command.withDescription("List all referenced packages in the project"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const prompter = yield* Prompter

      yield* prompter.log.info("TODO: Read lockfile and print all referenced packages")
    })
  )
)
