import * as Effect from "effect/Effect"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"

const pkg = Argument.string("package").pipe(
  Argument.withDescription("Package name to remove (e.g. react, @effect/cli)")
)

export default Command.make("remove", { pkg }).pipe(
  Command.withDescription("Remove a package reference from the project"),
  Command.withHandler(({ pkg }) =>
    Effect.gen(function* () {
      yield* Effect.log(`TODO: Remove project directory and lockfile entry for ${pkg}`)
    })
  )
)
