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
  Command.withDescription("Initialize Packref files and agent guidance in the current project"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const prompter = yield* Prompter
      const projectPath = yield* fs.realPath(path.resolve())

      yield* printTitle()

      yield* prompter.intro("🚚 packref init")
      yield* prompter.log.info(`Preparing project at ${projectPath}`)

      const shouldAddIgnoreEntries = yield* prompter.confirm({
        initialValue: true,
        message: "Ignore generated Packref references and exclude `.packref` from TypeScript?",
      })

      const shouldAddAgentsGuidance = yield* prompter.confirm({
        initialValue: true,
        message: "Add a guidance section to AGENTS.md so coding agents know how to use Packref?",
      })

      yield* prompter.withSpinner(() => ensureDirectory(projectPath), {
        failure: "Failed to prepare project directory",
        start: "Ensuring project directory exists...",
        success: "Project directory is ready",
      })

      const lockfile = yield* prompter.withSpinner(() => initializeLockfile(projectPath), {
        failure: "Failed to create the packref-lock.json",
        start: "Creating the packref-lock.json...",
        success: "Created the packref-lock.json",
      })

      yield* prompter.withSpinner(() => registerProject(projectPath), {
        failure: "Failed to register project in global store",
        start: "Registering project in global store...",
        success: "Project registered in global store",
      })

      if (shouldAddIgnoreEntries) {
        yield* prompter.withSpinner(() => ensureGitignoreEntry(projectPath), {
          failure: "Failed to update .gitignore",
          start: "Updating .gitignore...",
          success: ".gitignore is ready",
        })

        const tsconfigResult = yield* prompter.withSpinner(
          () => ensureTsconfigExclude(projectPath),
          {
            failure: "Failed to update tsconfig.json",
            start: "Updating tsconfig.json...",
            success: (result) =>
              result === "missing"
                ? "No tsconfig.json found"
                : result === "malformed"
                  ? "Could not update tsconfig.json"
                  : "tsconfig.json is ready",
          }
        )

        if (tsconfigResult === "malformed") {
          yield* prompter.log.warning(
            "Could not update tsconfig.json because it is malformed. Add `.packref` to `exclude` manually."
          )
        }
      }

      if (shouldAddAgentsGuidance) {
        const agentsResult = yield* prompter.withSpinner(() => writeAgentsSection(projectPath), {
          failure: "Failed to update AGENTS.md",
          start: "Updating AGENTS.md...",
          success: (result) =>
            result === "malformed" ? "Could not update AGENTS.md" : "AGENTS.md is ready",
        })

        if (agentsResult === "malformed") {
          yield* prompter.log.warning(
            "Could not update AGENTS.md because Packref markers are incomplete. Remove the stale PACKREF marker and run packref init again."
          )
        }
      }

      if (lockfile.packages.length > 0) {
        yield* prompter.log.info(
          `Found ${lockfile.packages.length} locked reference${lockfile.packages.length === 1 ? "" : "s"}. Run \`packref install\` to materialize missing source trees.`
        )
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
