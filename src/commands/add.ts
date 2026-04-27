import * as Effect from "effect/Effect"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import { Prompter } from "#lib/services/prompter.ts"

const pkg = Argument.string("package").pipe(
  Argument.withDescription("Package name with optional version (e.g. react, hono@4.2.0)")
)

export default Command.make("add", { pkg }).pipe(
  Command.withDescription("Add a package reference"),
  Command.withHandler(({ pkg }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter

      yield* prompter.log.info(
        `TODO: Resolve ${pkg}, fetch repository, clone snapshot, store globally, reflink into project, update lockfile`
      )
    })
  )
)
