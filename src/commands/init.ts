import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Command from "effect/unstable/cli/Command"
import { Prompter } from "#lib/services/prompter.ts"
import { printTitle } from "#lib/shared/terminal.ts"
import { registerProject } from "#lib/workspace/config.ts"
import {
  ensureGitignoreEntry,
  ensureTsconfigExclude,
  writeAgentsSection,
} from "#lib/workspace/integration.ts"
import { initializeLockfile } from "#lib/workspace/lockfile.ts"
import { ensureDirectory } from "#lib/workspace/project.ts"

export default Command.make("init").pipe(
  Command.withDescription("Initialize packref in the current project"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const prompter = yield* Prompter
      const projectPath = yield* fs.realPath(path.resolve(cwd))

      yield* printTitle()

      yield* prompter.intro("🚚 packref init")
      yield* prompter.log.info(`Preparing project at ${projectPath}`)

      const shouldAddIgnoreEntries = yield* prompter.confirm({
        initialValue: true,
        message: "Add `.packref` to .gitignore and tsconfig.json exclude?",
      })

      const shouldAddAgentsGuidance = yield* prompter.confirm({
        initialValue: true,
        message: "Add a guidance section to AGENTS.md so coding agents know how to use Packref?",
      })

      yield* prompter.withSpinner(ensureDirectory(projectPath), {
        error: "Failed to prepare project directory",
        start: "Ensuring project directory exists...",
        stop: "Project directory is ready",
      })

      yield* prompter.withSpinner(initializeLockfile(projectPath), {
        error: "Failed to create the packref-lock.json",
        start: "Creating the packref-lock.json...",
        stop: "Created the packref-lock.json",
      })

      yield* prompter.withSpinner(registerProject(projectPath), {
        error: "Failed to register project in global store",
        start: "Registering project in global store...",
        stop: "Project registered in global store",
      })

      if (shouldAddIgnoreEntries) {
        yield* prompter.withSpinner(ensureGitignoreEntry(projectPath), {
          error: "Failed to update .gitignore",
          start: "Updating .gitignore...",
          stop: ".gitignore is ready",
        })

        const tsconfigResult = yield* prompter.withSpinner(ensureTsconfigExclude(projectPath), {
          error: "Failed to update tsconfig.json",
          start: "Updating tsconfig.json...",
          stop: "tsconfig.json check complete",
        })

        if (tsconfigResult === "malformed") {
          yield* prompter.log.warning(
            "Could not update tsconfig.json because it is malformed. Add `.packref` to `exclude` manually."
          )
        }
      }

      if (shouldAddAgentsGuidance) {
        const agentsResult = yield* prompter.withSpinner(writeAgentsSection(projectPath), {
          error: "Failed to update AGENTS.md",
          start: "Updating AGENTS.md...",
          stop: "AGENTS.md check complete",
        })

        if (agentsResult === "malformed") {
          yield* prompter.log.warning(
            "Could not update AGENTS.md because Packref markers are incomplete. Remove the stale PACKREF marker and run packref init again."
          )
        }
      }

      yield* prompter.log.success(`Initialized packref in ${projectPath}`)
      yield* prompter.outro("🎉 You're ready to start using Packref!")
    }).pipe(
      Effect.catchTags({
        OperationCancelled: () =>
          Effect.gen(function* () {
            const prompter = yield* Prompter
            yield* prompter.cancel("You've cancelled the initialization process.")
          }),
      })
    )
  )
)
