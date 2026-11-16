import * as Array from "effect/Array"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Prompt from "effect/cli/Prompt"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import type { ManifestDependency } from "#lib/manifests/manifest.ts"
import { formatPackageIdentity } from "#lib/core/identity.ts"
import { parsePackageSpec } from "#lib/core/packages.ts"
import {
  addPackageReference,
  findPackageCandidates,
  materializePackageCandidateReference,
  resolvePackageCandidateReference,
  type AddPackageResult,
} from "#lib/references/add.ts"
import * as Output from "#terminal/output.ts"
import { printTitle } from "#terminal/title.ts"

const pkg = Argument.String("package").pipe(
  Argument.withDescription(
    "Registry package with an optional version, or a direct repository spec (e.g. react, hono@4.2.0, adelrodriguez/packref)"
  ),
  Argument.optional
)

const reportAddDetails = Effect.fn("reportAddDetails")(function* (result: AddPackageResult) {
  yield* Output.success(
    `Added ${formatPackageIdentity(result.entry)} from ${result.entry.source.type}`
  )

  if (Predicate.isNotUndefined(result.manifestRange)) {
    yield* Output.warning(
      `${result.entry.name} has no installed version (no lockfile entry or node_modules copy); `
        + `resolved ${result.manifestRange} -> ${result.entry.version} from the registry. `
        + "Run your package manager's install, then `packref sync`, to pin the installed version."
    )
  }

  if (result.reusedStoreEntry) {
    yield* Output.info("Reused the existing global store entry")
  }
})

const addPackage = Effect.fn("addPackage")(function* (pkg: string) {
  const spec = yield* parsePackageSpec(pkg)
  const result = yield* addPackageReference(spec)

  yield* reportAddDetails(result)

  return result
})

const addPackageCandidate = Effect.fn("addPackageCandidate")(function* (
  dependency: ManifestDependency,
  projectPath: string
) {
  const resolution = yield* resolvePackageCandidateReference(dependency)
  const result = yield* materializePackageCandidateReference(resolution, projectPath)

  yield* reportAddDetails(result)

  return result
})

const addSelectedPackages = Effect.fn("addSelectedPackages")(function* () {
  const candidates = yield* findPackageCandidates()

  return yield* Array.match(candidates.dependencies, {
    onEmpty: () =>
      Effect.gen(function* () {
        yield* Output.info("No project dependencies are available to add.")
        yield* Output.outro("No package references added")
      }),
    onNonEmpty: (dependencies) =>
      Effect.gen(function* () {
        const selectedPackages = yield* Prompt.MultiSelect({
          choices: dependencies.map((dependency) => ({
            description: `${dependency.group}, ${dependency.exactVersion ?? dependency.specifier}`,
            title: `${dependency.registry}:${dependency.name}`,
            value: dependency,
          })),
          message: "Select packages to add",
        })

        yield* Effect.forEach(
          selectedPackages,
          (selectedPackage) => addPackageCandidate(selectedPackage, candidates.projectPath),
          { discard: true }
        )

        yield* Output.outro(
          Array.match(selectedPackages, {
            onEmpty: () => "No package references added",
            onNonEmpty: (packages) =>
              `Added ${packages.length} package reference${packages.length === 1 ? "" : "s"}`,
          })
        )
      }),
  })
})

const addNamedPackage = Effect.fn("addNamedPackage")(function* (pkg: string) {
  const result = yield* addPackage(pkg)
  yield* Output.outro(`Reference available at ${result.referencePath}`)
})

export default Command.make("add", { pkg }).pipe(
  Command.withDescription(
    "Add a package source reference by registry package, direct repository, or selection"
  ),
  Command.withHandler(({ pkg }) =>
    Effect.gen(function* () {
      yield* printTitle
      yield* Output.intro(
        `📦 packref add${Option.match(pkg, { onNone: () => "", onSome: (value) => ` ${value}` })}`
      )
      yield* Option.match(pkg, {
        onNone: addSelectedPackages,
        onSome: addNamedPackage,
      })
    }).pipe(
      Effect.catchTag("QuitError", () =>
        Output.cancel("You've cancelled the package addition process.")
      )
    )
  )
)
