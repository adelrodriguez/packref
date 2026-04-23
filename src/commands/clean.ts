import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"

export default Command.make("clean").pipe(
  Command.withDescription("Remove all entries from the global Packref store"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      yield* Effect.log(
        "TODO: Delete entries inside ~/.agents/packref/store/ while preserving project-local .packref/ directories and lockfiles"
      )
    })
  )
)
