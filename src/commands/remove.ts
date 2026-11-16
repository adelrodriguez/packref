import * as Array from "effect/Array"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Prompt from "effect/cli/Prompt"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { PackageEntry } from "#lib/workspace/lockfile.ts"
import { formatPackageIdentity } from "#lib/core/identity.ts"
import { parsePackageSpec } from "#lib/core/packages.ts"
import {
  findPackageReferenceMatches,
  listPackageReferences,
  removePackageReferences,
} from "#lib/references/remove.ts"
import * as Output from "#terminal/output.ts"
import { printTitle } from "#terminal/title.ts"

const pkg = Argument.String("package").pipe(
  Argument.withDescription("Package name to remove (e.g. react, @effect/cli)"),
  Argument.optional
)

const formatHint = (entry: PackageEntry) => {
  const source = entry.source.type === "repository" ? entry.source.host : entry.source.type

  return entry.tracking === "manual" ? `${source} (manual)` : source
}

interface ReferenceSelection {
  readonly entries: readonly PackageEntry[]
  readonly projectPath: string
}

const selectNamedReferences = Effect.fn("selectNamedReferences")(function* (pkg: string) {
  const spec = yield* parsePackageSpec(pkg)
  const match = yield* findPackageReferenceMatches(spec)

  const entries = yield* match.entries.length === 1
    ? Effect.succeed(match.entries)
    : Prompt.MultiSelect({
        choices: match.entries.map((candidate) => ({
          description: formatHint(candidate),
          title: candidate.version,
          value: candidate,
        })),
        message: `Select versions of ${spec.registry}:${spec.name} to remove`,
      })

  return Array.match(entries, {
    onEmpty: Option.none,
    onNonEmpty: (entries) =>
      Option.some({
        entries,
        projectPath: match.projectPath,
      } satisfies ReferenceSelection),
  })
})

const selectAllReferences = Effect.fn("selectAllReferences")(function* () {
  const references = yield* listPackageReferences()

  return yield* Array.match(references.entries, {
    onEmpty: () =>
      Output.info("No packages are currently installed.").pipe(Effect.as(Option.none())),
    onNonEmpty: (entries) =>
      Prompt.MultiSelect({
        choices: entries.map((candidate) => ({
          description: formatHint(candidate),
          title: formatPackageIdentity(candidate),
          value: candidate,
        })),
        message: "Select packages to remove",
      }).pipe(
        Effect.map((selectedEntries) =>
          Array.match(selectedEntries, {
            onEmpty: Option.none,
            onNonEmpty: (selectedEntries) =>
              Option.some({
                entries: selectedEntries,
                projectPath: references.projectPath,
              } satisfies ReferenceSelection),
          })
        )
      ),
  })
})

const removeSelectedReferences = Effect.fn("removeSelectedReferences")(function* (
  selection: ReferenceSelection
) {
  const result = yield* removePackageReferences(selection.projectPath, selection.entries)

  for (const entry of result.missingEntries) {
    yield* Output.warning(
      `Reference directory for ${formatPackageIdentity(entry)} was already missing; removed its lockfile entry.`
    )
  }

  for (const entry of result.removedEntries) {
    yield* Output.success(`Removed ${formatPackageIdentity(entry)}`)
  }

  return result.removedEntries.length
})

export default Command.make("remove", { pkg }).pipe(
  Command.withAlias("rm"),
  Command.withDescription("Remove package source references by name, version, or selection"),
  Command.withHandler(({ pkg }) =>
    Effect.gen(function* () {
      yield* printTitle
      yield* Output.intro(
        `📦 packref remove${Option.match(pkg, { onNone: () => "", onSome: (value) => ` ${value}` })}`
      )

      const selection = yield* Option.match(pkg, {
        onNone: selectAllReferences,
        onSome: selectNamedReferences,
      })

      const removedCount = yield* Option.match(selection, {
        onNone: () => Effect.succeed(0),
        onSome: removeSelectedReferences,
      })

      yield* Output.outro(
        removedCount === 0
          ? "No package references removed"
          : `Removed ${removedCount} package reference${removedCount === 1 ? "" : "s"}`
      )
    }).pipe(
      Effect.catchTag("QuitError", () =>
        Output.cancel("You've cancelled the package removal process.")
      )
    )
  )
)
