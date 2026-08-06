import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import {
  installPackageReferences,
  type InstallPackageReferencesResult,
} from "#lib/references/install.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { printTitle } from "#lib/shared/terminal.ts"

const reportInstallResult = Effect.fn("reportInstallResult")(function* (
  result: InstallPackageReferencesResult
) {
  const prompter = yield* Prompter

  if (result.fetched.length > 0) {
    yield* prompter.log.success(
      `Fetched ${result.fetched.length} reference${result.fetched.length === 1 ? "" : "s"}`
    )
  }

  if (result.reused.length > 0) {
    yield* prompter.log.success(
      `Reused ${result.reused.length} global store entr${result.reused.length === 1 ? "y" : "ies"}`
    )
  }

  if (result.alreadyInstalled.length > 0) {
    yield* prompter.log.info(
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
      const prompter = yield* Prompter

      yield* printTitle()
      yield* prompter.intro("📥 packref install")

      const result = yield* prompter.withSpinner(() => installPackageReferences(), {
        failure: "Failed to install Packref references",
        start: "Installing references from packref-lock.json...",
        success: "Finished installing Packref references",
      })
      const installed = result.fetched.length + result.reused.length

      yield* reportInstallResult(result)
      yield* prompter.outro(
        installed > 0
          ? `Installed ${installed} locked reference${installed === 1 ? "" : "s"}`
          : result.alreadyInstalled.length > 0
            ? "All locked references are already installed"
            : "No locked references to install"
      )
    })
  )
)
