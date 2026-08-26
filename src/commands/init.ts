import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Match from "effect/Match"
import * as Path from "effect/Path"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import { RequestedIntegrationError } from "#lib/core/errors.ts"
import { registerProject } from "#lib/workspace/config.ts"
import {
  ensureGitignoreEntry,
  ensureTsconfigExclude,
  writeAgentsSection,
} from "#lib/workspace/integration.ts"
import { initializeLockfile } from "#lib/workspace/lockfile.ts"
import { ensureDirectory } from "#lib/workspace/project.ts"
import { Prompter } from "#terminal/prompter.ts"
import { printTitle } from "#terminal/title.ts"

const nonInteractive = Flag.boolean("non-interactive").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Configure the project from flags without prompts")
)

const ignore = Flag.boolean("ignore").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Update .gitignore and exclude .packref from TypeScript")
)

const agents = Flag.boolean("agents").pipe(
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
      const prompter = yield* Prompter
      const projectPath = yield* fs.realPath(path.resolve())

      if (!nonInteractive && (ignore || agents)) {
        return yield* new InitFlagsRequireNonInteractiveError({ requiredMode: "non-interactive" })
      }

      yield* printTitle()

      yield* prompter.intro(`🚚 packref init${nonInteractive ? " --non-interactive" : ""}`)
      yield* prompter.log.info(`Preparing project at ${projectPath}`)

      const shouldAddIgnoreEntries = nonInteractive
        ? ignore
        : yield* prompter.confirm({
            initialValue: true,
            message: "Ignore generated Packref references and exclude `.packref` from TypeScript?",
          })

      const shouldAddAgentsGuidance = nonInteractive
        ? agents
        : yield* prompter.confirm({
            initialValue: true,
            message:
              "Add a guidance section to AGENTS.md so coding agents know how to use Packref?",
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
              Match.value(result).pipe(
                Match.when("missing", () => "No tsconfig.json found"),
                Match.when("malformed", () => "Could not update tsconfig.json"),
                Match.orElse(() => "tsconfig.json is ready")
              ),
          }
        )

        if (tsconfigResult === "malformed") {
          yield* prompter.log.warning(
            "Could not update tsconfig.json because it is malformed. Add `.packref` to `exclude` manually."
          )

          if (nonInteractive) {
            return yield* new RequestedIntegrationError({ target: "tsconfig.json" })
          }
        }
      }

      if (shouldAddAgentsGuidance) {
        const agentsResult = yield* prompter.withSpinner(() => writeAgentsSection(projectPath), {
          failure: "Failed to update AGENTS.md",
          start: "Updating AGENTS.md...",
          success: (result) =>
            Match.value(result).pipe(
              Match.when("malformed", () => "Could not update AGENTS.md"),
              Match.orElse(() => "AGENTS.md is ready")
            ),
        })

        if (agentsResult === "malformed") {
          yield* prompter.log.warning(
            "Could not update AGENTS.md because Packref markers are incomplete. Remove the stale PACKREF marker and run packref init again."
          )

          if (nonInteractive) {
            return yield* new RequestedIntegrationError({ target: "AGENTS.md" })
          }
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
