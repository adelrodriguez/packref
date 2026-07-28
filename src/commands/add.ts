import * as Effect from "effect/Effect"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import { parsePackageSpec } from "#lib/core/packages.ts"
import { addPackageReference } from "#lib/references/add.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { printTitle } from "#lib/shared/terminal.ts"

const pkg = Argument.string("package").pipe(
  Argument.withDescription("Package name with optional version (e.g. react, hono@4.2.0)")
)

export default Command.make("add", { pkg }).pipe(
  Command.withDescription("Add a package reference"),
  Command.withHandler(({ pkg }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const spec = yield* parsePackageSpec(pkg)

      yield* printTitle()
      yield* prompter.intro(`📦 packref add ${pkg}`)

      const result = yield* prompter.withSpinner(addPackageReference(spec), {
        error: `Failed to add ${pkg}`,
        start: `Resolving and fetching ${pkg}...`,
        stop: `Added ${pkg}`,
      })

      if (result.manifestRange !== undefined) {
        yield* prompter.log.warning(
          `${result.entry.name} has no installed version (no lockfile entry or node_modules copy); ` +
            `resolved ${result.manifestRange} -> ${result.entry.version} from the registry. ` +
            "Run your package manager's install, then `packref sync`, to pin the installed version."
        )
      }

      if (result.reusedStoreEntry) {
        yield* prompter.log.info("Reused the existing global store entry")
      }

      yield* prompter.log.success(
        `Added ${result.entry.registry}:${result.entry.name}@${result.entry.version} from ${result.entry.source.type}`
      )
      yield* prompter.outro(`Reference available at ${result.referencePath}`)
    })
  )
)
