import * as Effect from "effect/Effect"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import { Prompter } from "#lib/services/prompter.ts"

const pkg = Argument.string("package").pipe(
  Argument.withDescription("Package name to remove (e.g. react, @effect/cli)")
)

export default Command.make("remove", { pkg }).pipe(
  Command.withDescription("Remove a package reference from the project"),
  Command.withHandler(({ pkg }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter

      yield* prompter.log.info(`TODO: Remove project directory and lockfile entry for ${pkg}`)
    })
  )
)
