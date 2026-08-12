import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import type { ManifestDependency } from "#lib/manifests/manifest.ts"
import { formatPackageIdentity, parsePackageSpec } from "#lib/core/packages.ts"
import {
  addPackageReference,
  findPackageCandidates,
  materializePackageCandidateReference,
  resolvePackageCandidateReference,
  type AddPackageResult,
} from "#lib/references/add.ts"
import { Prompter } from "#terminal/prompter.ts"
import { printTitle } from "#terminal/title.ts"

const pkg = Argument.string("package").pipe(
  Argument.withDescription(
    "Registry package with an optional version, or a direct repository spec (e.g. react, hono@4.2.0, metaideas/packref)"
  ),
  Argument.optional
)

const reportAddDetails = Effect.fn("reportAddDetails")(function* (result: AddPackageResult) {
  const prompter = yield* Prompter

  if (Predicate.isNotUndefined(result.manifestRange)) {
    yield* prompter.log.warning(
      `${result.entry.name} has no installed version (no lockfile entry or node_modules copy); ` +
        `resolved ${result.manifestRange} -> ${result.entry.version} from the registry. ` +
        "Run your package manager's install, then `packref sync`, to pin the installed version."
    )
  }

  if (result.reusedStoreEntry) {
    yield* prompter.log.info("Reused the existing global store entry")
  }
})

const addPackage = Effect.fn("addPackage")(function* (pkg: string) {
  const prompter = yield* Prompter
  const spec = yield* parsePackageSpec(pkg)
  const result = yield* prompter.withSpinner(() => addPackageReference(spec), {
    failure: `Failed to add ${pkg}`,
    start: `Resolving and fetching ${pkg}...`,
    success: ({ entry }) => `Added ${formatPackageIdentity(entry)} from ${entry.source.type}`,
  })

  yield* reportAddDetails(result)
  return result
})

const addPackageCandidate = Effect.fn("addPackageCandidate")(function* (
  dependency: ManifestDependency,
  projectPath: string
) {
  const prompter = yield* Prompter
  const label = `${dependency.registry}:${dependency.name}`
  const result = yield* prompter.withSpinner(
    (spinner) =>
      Effect.gen(function* () {
        const resolution = yield* resolvePackageCandidateReference(dependency)
        const identity = resolution.resolvedPackage.identity

        yield* spinner.message(`Fetching and materializing ${formatPackageIdentity(identity)}...`)

        return yield* materializePackageCandidateReference(resolution, projectPath)
      }),
    {
      failure: `Failed to add ${label}`,
      start: `Resolving ${label}...`,
      success: ({ entry }) => `Added ${formatPackageIdentity(entry)} from ${entry.source.type}`,
    }
  )

  yield* reportAddDetails(result)
  return result
})

const addSelectedPackages = Effect.fn("addSelectedPackages")(function* () {
  const prompter = yield* Prompter
  const candidates = yield* findPackageCandidates()

  return yield* Array.match(candidates.dependencies, {
    onEmpty: () =>
      Effect.gen(function* () {
        yield* prompter.log.info("No project dependencies are available to add.")
        yield* prompter.outro("No package references added")
      }),
    onNonEmpty: (dependencies) =>
      Effect.gen(function* () {
        const selectedPackages = yield* prompter.multiselect({
          message: "Select packages to add",
          options: dependencies.map((dependency) => ({
            hint: `${dependency.group}, ${dependency.exactVersion ?? dependency.specifier}`,
            label: `${dependency.registry}:${dependency.name}`,
            value: dependency,
          })),
          required: false,
        })

        yield* Effect.forEach(
          selectedPackages,
          (selectedPackage) => addPackageCandidate(selectedPackage, candidates.projectPath),
          { discard: true }
        )

        yield* prompter.outro(
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
  const prompter = yield* Prompter
  const result = yield* addPackage(pkg)
  yield* prompter.outro(`Reference available at ${result.referencePath}`)
})

export default Command.make("add", { pkg }).pipe(
  Command.withDescription(
    "Add a package source reference by registry package, direct repository, or selection"
  ),
  Command.withHandler(({ pkg }) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter

      yield* printTitle()
      yield* prompter.intro(
        `📦 packref add${Option.match(pkg, { onNone: () => "", onSome: (value) => ` ${value}` })}`
      )
      yield* Option.match(pkg, {
        onNone: addSelectedPackages,
        onSome: addNamedPackage,
      })
    }).pipe(
      Effect.catchTags({
        OperationCancelled: () =>
          Effect.gen(function* () {
            const prompter = yield* Prompter
            yield* prompter.cancel("You've cancelled the package addition process.")
          }),
      })
    )
  )
)
