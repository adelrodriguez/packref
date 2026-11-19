import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import {
  installPackageReferences,
  type InstallPackageReferencesResult,
} from "#lib/references/install.ts"
import * as Output from "#terminal/output.ts"
import { printTitle } from "#terminal/title.ts"

const reportInstallResult = Effect.fn("reportInstallResult")(function* (
  result: InstallPackageReferencesResult
) {
  if (result.fetched.length > 0) {
    yield* Output.success(
      `Fetched ${result.fetched.length} reference${result.fetched.length === 1 ? "" : "s"}`
    )
  }

  if (result.reused.length > 0) {
    yield* Output.success(
      `Reused ${result.reused.length} global store entr${result.reused.length === 1 ? "y" : "ies"}`
    )
  }

  if (result.alreadyInstalled.length > 0) {
    yield* Output.info(
      `${result.alreadyInstalled.length} reference${result.alreadyInstalled.length === 1 ? " is" : "s are"} already installed`
    )
  }
})

export default Command.make("install").pipe(
  Command.withDescription(
    "Install Packref source references from packref-lock.json (not project dependencies)"
  ),
  Command.withHandler(() =>
    Effect.gen(function* () {
      yield* printTitle
      yield* Output.intro("📥 packref install")

      const result = yield* installPackageReferences()
      yield* Output.success("Finished installing Packref references")
      const installed = result.fetched.length + result.reused.length

      yield* reportInstallResult(result)
      yield* Output.outro(
        installed > 0
          ? `Installed ${installed} locked reference${installed === 1 ? "" : "s"}`
          : result.alreadyInstalled.length > 0
            ? "All locked references are already installed"
            : "No locked references to install"
      )
    })
  )
)
