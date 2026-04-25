import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import { Prompter } from "#lib/services/prompter.ts"

export default Command.make("sync").pipe(
  Command.withDescription("Sync package references with resolved project dependencies"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const prompter = yield* Prompter

      yield* prompter.log.info(
        "TODO: Reconcile dependency-tracked lockfile entries against exact project dependency versions resolved via nypm, node_modules, then registry fallback"
      )
    })
  )
)
