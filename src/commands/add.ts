import * as Effect from "effect/Effect"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"

const pkg = Argument.string("package").pipe(
  Argument.withDescription("Package name with optional version (e.g. react, hono@4.2.0)")
)

export default Command.make("add", { pkg }).pipe(
  Command.withDescription("Add a package reference"),
  Command.withHandler(({ pkg }) =>
    Effect.gen(function* () {
      yield* Effect.log(
        `TODO: Resolve ${pkg}, fetch repository, clone snapshot, store globally, reflink into project, update lockfile`
      )
    })
  )
)
