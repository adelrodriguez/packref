import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import type { PackageIdentity } from "#lib/core/packages.ts"
import type { PackageEntry } from "#lib/core/workspace.ts"
import { parsePackageSpec } from "#lib/logic/packages.ts"
import {
  findPackageReferenceMatches,
  listPackageReferences,
  removePackageReferences,
} from "#lib/references/remove.ts"
import { Prompter } from "#terminal/prompter.ts"
import { printTitle } from "#terminal/title.ts"

const pkg = Argument.string("package").pipe(
  Argument.withDescription("Package name to remove (e.g. react, @effect/cli)"),
  Argument.optional
)

const formatIdentity = (identity: PackageIdentity) =>
  `${identity.registry}:${identity.name}@${identity.version}`

const formatHint = (entry: PackageEntry) => {
  const source = entry.source.type === "repository" ? entry.source.host : entry.source.type
  return entry.tracking === "manual" ? `${source} (manual)` : source
}

interface ReferenceSelection {
  readonly entries: readonly PackageEntry[]
  readonly projectPath: string
}

const selectNamedReferences = Effect.fn("selectNamedReferences")(function* (pkg: string) {
  const prompter = yield* Prompter
  const spec = yield* parsePackageSpec(pkg)
  const match = yield* findPackageReferenceMatches(spec)

  const entries = yield* match.entries.length === 1
    ? Effect.succeed(match.entries)
    : prompter.multiselect({
        message: `Select versions of ${spec.registry}:${spec.name} to remove`,
        options: match.entries.map((candidate) => ({
          hint: formatHint(candidate),
          label: candidate.version,
          value: candidate,
        })),
        required: false,
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
  const prompter = yield* Prompter
  const references = yield* listPackageReferences()

  return yield* Array.match(references.entries, {
    onEmpty: () =>
      prompter.log.info("No packages are currently installed.").pipe(Effect.as(Option.none())),
    onNonEmpty: (entries) =>
      prompter
        .multiselect({
          message: "Select packages to remove",
          options: entries.map((candidate) => ({
            hint: formatHint(candidate),
            label: formatIdentity(candidate),
            value: candidate,
          })),
          required: false,
        })
        .pipe(
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
  const prompter = yield* Prompter
  const result = yield* removePackageReferences(selection.projectPath, selection.entries)

  for (const entry of result.missingEntries) {
    yield* prompter.log.warning(
      `Reference directory for ${formatIdentity(entry)} was already missing; removed its lockfile entry.`
    )
  }

  for (const entry of result.removedEntries) {
    yield* prompter.log.success(`Removed ${formatIdentity(entry)}`)
  }

  return result.removedEntries.length
})

export default Command.make("remove", { pkg }).pipe(
  Command.withAlias("rm"),
  Command.withDescription("Remove package source references by name, version, or selection"),
  Command.withHandler(({ pkg }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter

      yield* printTitle()
      yield* prompter.intro(
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

      yield* prompter.outro(
        removedCount === 0
          ? "No package references removed"
          : `Removed ${removedCount} package reference${removedCount === 1 ? "" : "s"}`
      )
    }).pipe(
      Effect.catchTags({
        OperationCancelled: () =>
          Effect.gen(function* () {
            const prompter = yield* Prompter
            yield* prompter.cancel("You've cancelled the package removal process.")
          }),
      })
    )
  )
)
