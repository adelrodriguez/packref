import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"

export default Command.make("sync").pipe(
  Command.withDescription("Sync package references with resolved project dependencies"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      yield* Effect.log(
        "TODO: Reconcile dependency-tracked lockfile entries against exact project dependency versions resolved via nypm, node_modules, then registry fallback"
      )
    })
  )
)
