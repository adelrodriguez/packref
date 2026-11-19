import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Prompt from "effect/cli/Prompt"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Match from "effect/Match"
import * as Path from "effect/Path"
import { RequestedIntegrationError } from "#lib/core/errors.ts"
import { registerProject } from "#lib/workspace/config.ts"
import {
  ensureGitignoreEntry,
  ensureTsconfigExclude,
  writeAgentsSection,
} from "#lib/workspace/integration.ts"
import { initializeLockfile } from "#lib/workspace/lockfile.ts"
import { ensureDirectory } from "#lib/workspace/project.ts"
import * as Output from "#terminal/output.ts"
import { printTitle } from "#terminal/title.ts"

const nonInteractive = Flag.Boolean("non-interactive").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Configure the project from flags without prompts")
)

const ignore = Flag.Boolean("ignore").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Update .gitignore and exclude .packref from TypeScript")
)

const agents = Flag.Boolean("agents").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Add Packref guidance to AGENTS.md")
)

export class InitFlagsRequireNonInteractiveError extends Data.TaggedError(
  "InitFlagsRequireNonInteractiveError"
)<{
  requiredMode: "non-interactive"
}> {
  override get message() {
    return `Setup flags require --${this.requiredMode}. Run \`packref init\` for interactive setup.`
  }
}

export default Command.make("init", { agents, ignore, nonInteractive }).pipe(
  Command.withDescription("Initialize Packref files and agent guidance in the current project"),
  Command.withHandler(({ agents, ignore, nonInteractive }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const projectPath = yield* fs.realPath(path.resolve())

      if (!nonInteractive && (ignore || agents)) {
        return yield* new InitFlagsRequireNonInteractiveError({ requiredMode: "non-interactive" })
      }

      yield* printTitle

      yield* Output.intro(`🚚 packref init${nonInteractive ? " --non-interactive" : ""}`)
      yield* Output.info(`Preparing project at ${projectPath}`)

      const shouldAddIgnoreEntries = nonInteractive
        ? ignore
        : yield* Prompt.Confirm({
            initial: true,
            message: "Ignore generated Packref references and exclude `.packref` from TypeScript?",
          })

      const shouldAddAgentsGuidance = nonInteractive
        ? agents
        : yield* Prompt.Confirm({
            initial: true,
            message:
              "Add a guidance section to AGENTS.md so coding agents know how to use Packref?",
          })

      yield* ensureDirectory(projectPath)
      yield* Output.success("Project directory is ready")

      const lockfile = yield* initializeLockfile(projectPath)
      yield* Output.success("Created the packref-lock.json")

      yield* registerProject(projectPath)
      yield* Output.success("Project registered in global store")

      if (shouldAddIgnoreEntries) {
        yield* ensureGitignoreEntry(projectPath)
        yield* Output.success(".gitignore is ready")

        const tsconfigResult = yield* ensureTsconfigExclude(projectPath)

        yield* Match.value(tsconfigResult).pipe(
          Match.when("missing", () => Output.info("No tsconfig.json found")),
          Match.when("malformed", () => Effect.void),
          Match.orElse(() => Output.success("tsconfig.json is ready"))
        )

        if (tsconfigResult === "malformed") {
          yield* Output.warning(
            "Could not update tsconfig.json because it is malformed. Add `.packref` to `exclude` manually."
          )

          if (nonInteractive) {
            return yield* new RequestedIntegrationError({ target: "tsconfig.json" })
          }
        }
      }

      if (shouldAddAgentsGuidance) {
        const agentsResult = yield* writeAgentsSection(projectPath)

        if (agentsResult === "updated") {
          yield* Output.success("AGENTS.md is ready")
        }

        if (agentsResult === "malformed") {
          yield* Output.warning(
            "Could not update AGENTS.md because Packref markers are incomplete. Remove the stale PACKREF marker and run packref init again."
          )

          if (nonInteractive) {
            return yield* new RequestedIntegrationError({ target: "AGENTS.md" })
          }
        }
      }

      if (lockfile.packages.length > 0) {
        yield* Output.info(
          `Found ${lockfile.packages.length} locked reference${lockfile.packages.length === 1 ? "" : "s"}. Run \`packref install\` to materialize missing source trees.`
        )
      }

      yield* Output.success(`Initialized packref in ${projectPath}`)
      yield* Output.outro("🎉 You're ready to start using Packref!")
    }).pipe(
      Effect.catchTag("QuitError", () =>
        Output.cancel("You've cancelled the initialization process.")
      )
    )
  )
)
