import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import { formatPackageIdentity } from "#lib/core/identity.ts"
import { listPackageEntries, readProjectLockfile } from "#lib/workspace/lockfile.ts"
import { requireInitializedProject } from "#lib/workspace/project.ts"
import * as Output from "#terminal/output.ts"

export default Command.make("list").pipe(
  Command.withAlias("ls"),
  Command.withDescription("List package source references recorded for the current project"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const projectPath = yield* requireInitializedProject()
      const lockfile = yield* readProjectLockfile(projectPath)
      const entries = listPackageEntries(lockfile)

      if (entries.length === 0) {
        yield* Output.info("No packages are currently installed.")
        return
      }

      const rows = entries.map((entry) => ({
        entry,
        identity: formatPackageIdentity(entry),
        source: entry.source.type === "repository" ? entry.source.host : entry.source.type,
      }))
      const identityWidth = Math.max(...rows.map((row) => row.identity.length))
      const sourceWidth = Math.max(...rows.map((row) => row.source.length))
      const lines = [yield* Output.style("gray", `Packref packages (${entries.length})`)]

      for (const [index, row] of rows.entries()) {
        const isLast = index === rows.length - 1
        const branch = yield* Output.style("gray", isLast ? "└──" : "├──")
        const { entry } = row
        const identity = `${yield* Output.style("gray", `${entry.registry}:`)}${yield* Output.style("bold", entry.name)}${yield* Output.style(["dim", "yellow"], `@${entry.version}`)}`
        const isManual = entry.tracking === "manual"
        const source = yield* Output.style(
          "gray",
          isManual ? row.source.padEnd(sourceWidth) : row.source
        )
        const manualBadge = isManual ? `  ${yield* Output.style("yellow", "(manual)")}` : ""

        lines.push(
          `${branch} ${identity}${" ".repeat(identityWidth - row.identity.length)}  ${source}${manualBadge}`
        )
      }

      yield* Output.lines(lines)
    })
  )
)
