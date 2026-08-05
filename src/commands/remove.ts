import * as Effect from "effect/Effect"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import { parsePackageSpec, type PackageIdentity } from "#lib/core/packages.ts"
import { findPackageReferenceMatches, removePackageReferences } from "#lib/references/remove.ts"
import { Prompter } from "#lib/services/prompter.ts"

const pkg = Argument.string("package").pipe(
  Argument.withDescription("Package name to remove (e.g. react, @effect/cli)")
)

const formatIdentity = (identity: PackageIdentity) =>
  `${identity.registry}:${identity.name}@${identity.version}`

export default Command.make("remove", { pkg }).pipe(
  Command.withDescription("Remove a package reference from the project"),
  Command.withHandler(({ pkg }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const spec = yield* parsePackageSpec(pkg)
      const match = yield* findPackageReferenceMatches(spec)
      let selectedEntries = match.entries

      if (match.entries.length > 1) {
        const selectedVersions = yield* prompter.multiselect({
          message: `Select versions of ${spec.registry}:${spec.name} to remove`,
          options: match.entries.map((candidate) => ({
            hint: `${candidate.source.type}, ${candidate.tracking}`,
            label: candidate.version,
            value: candidate.version,
          })),
          required: true,
        })

        selectedEntries = match.entries.filter((entry) => selectedVersions.includes(entry.version))
      }
      const result = yield* removePackageReferences(match.projectPath, selectedEntries)

      for (const entry of result.missingEntries) {
        yield* prompter.log.warning(
          `Reference directory for ${formatIdentity(entry)} was already missing; removed its lockfile entry.`
        )
      }

      for (const entry of result.removedEntries) {
        yield* prompter.log.success(`Removed ${formatIdentity(entry)}`)
      }
    })
  )
)
