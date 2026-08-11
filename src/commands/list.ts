import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import color from "picocolors"
import { listPackageEntries, readProjectLockfile } from "#lib/workspace/lockfile.ts"
import { requireInitializedProject } from "#lib/workspace/project.ts"
import { Prompter } from "#terminal/prompter.ts"

export default Command.make("list").pipe(
  Command.withAlias("ls"),
  Command.withDescription("List package source references recorded for the current project"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const projectPath = yield* requireInitializedProject()
      const lockfile = yield* readProjectLockfile(projectPath)
      const entries = listPackageEntries(lockfile)

      if (entries.length === 0) {
        yield* prompter.log.info("No packages are currently installed.")
        return
      }

      const rows = entries.map((entry) => ({
        entry,
        identity: `${entry.registry}:${entry.name}@${entry.version}`,
        source: entry.source.type === "repository" ? entry.source.host : entry.source.type,
      }))
      const identityWidth = Math.max(...rows.map((row) => row.identity.length))
      const sourceWidth = Math.max(...rows.map((row) => row.source.length))
      const lines = [color.gray(`Packref packages (${entries.length})`)]

      for (const [index, row] of rows.entries()) {
        const isLast = index === rows.length - 1
        const branch = color.gray(isLast ? "└──" : "├──")
        const { entry } = row
        const identity = `${color.gray(`${entry.registry}:`)}${color.bold(entry.name)}${color.dim(color.yellow(`@${entry.version}`))}`
        const isManual = entry.tracking === "manual"
        const source = color.gray(isManual ? row.source.padEnd(sourceWidth) : row.source)
        const manualBadge = isManual ? `  ${color.yellow("(manual)")}` : ""

        lines.push(
          `${branch} ${identity}${" ".repeat(identityWidth - row.identity.length)}  ${source}${manualBadge}`
        )
      }

      yield* prompter.log.message(lines, { spacing: 0, withGuide: false })
    })
  )
)
