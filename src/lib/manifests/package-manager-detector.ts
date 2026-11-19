import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Filter from "effect/Filter"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { ManifestResolutionError } from "#lib/core/errors.ts"

/**
 * The package managers that the detector recognizes, in the order that it checks their files. A
 * project folder belongs to the first package manager whose lockfile or configuration file it has.
 * The order and the files match `detectPackageManager` of nypm 0.6.
 */
const PACKAGE_MANAGERS = [
  { files: ["package-lock.json"], name: "npm" },
  { files: ["aube-lock.yaml"], name: "aube" },
  { files: ["nub.lock"], name: "nub" },
  { files: ["pnpm-lock.yaml", "pnpm-workspace.yaml"], name: "pnpm" },
  { files: ["bun.lockb", "bun.lock"], name: "bun" },
  { files: ["yarn.lock", ".yarnrc.yml"], name: "yarn" },
  { files: ["deno.lock"], name: "deno" },
] as const

export type PackageManagerName = (typeof PACKAGE_MANAGERS)[number]["name"]

const PackageManagerNameSchema = Schema.Literals(PACKAGE_MANAGERS.map(({ name }) => name))

const DevEnginesPackageManagerSchema = Schema.Struct({ name: Schema.optional(Schema.String) })

const PackageJsonSchema = Schema.fromJsonString(
  Schema.Struct({
    devEngines: Schema.optional(
      Schema.Struct({
        packageManager: Schema.optional(
          Schema.Union([
            DevEnginesPackageManagerSchema,
            Schema.Array(DevEnginesPackageManagerSchema),
          ])
        ),
      })
    ),
    // The field has the form `<name>@<version>`, such as `pnpm@10.0.0+sha512.abc`.
    packageManager: Schema.optional(Schema.String),
  })
)

const decodePackageJson = Schema.decodeUnknownEffect(PackageJsonSchema)

/**
 * The package manager that a `package.json` names, such as `pnpm` in `"packageManager":
 * "pnpm@10.0.0"`. A name that the detector does not recognize is `None`.
 */
const readDeclaredName = (packageJson: typeof PackageJsonSchema.Type) => {
  const devEngines = packageJson.devEngines?.packageManager
  const declared =
    packageJson.packageManager?.split("@")[0]
    ?? (devEngines === undefined ? undefined : Arr.ensure(devEngines)[0]?.name)

  return declared === undefined || declared.length === 0
    ? Option.none<Option.Option<PackageManagerName>>()
    : Option.some(Schema.decodeUnknownOption(PackageManagerNameSchema)(declared))
}

/**
 * Lists `startPath` and each folder above it, nearest first.
 */
export const ancestorDirectories = (path: Path.Path, startPath: string): readonly string[] => {
  const parentPath = path.dirname(startPath)

  return parentPath === startPath
    ? [startPath]
    : [startPath, ...ancestorDirectories(path, parentPath)]
}

export interface PackageManagerDetectorService {
  /**
   * Finds the package manager of the project at `projectPath`, or of the nearest folder above it
   * that names or uses one. The result is `None` when no folder does, or when a `package.json`
   * names a package manager that the detector does not recognize.
   */
  readonly detect: (
    projectPath: string
  ) => Effect.Effect<Option.Option<PackageManagerName>, ManifestResolutionError>
}

export class PackageManagerDetector extends Context.Service<
  PackageManagerDetector,
  PackageManagerDetectorService
>()("PackageManagerDetector") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const readPackageJson = (directoryPath: string) => {
        const packageJsonPath = path.join(directoryPath, "package.json")

        return fs.readFileString(packageJsonPath).pipe(
          Effect.flatMap(decodePackageJson),
          Effect.asSome,
          Effect.catchFilter(Filter.reason("PlatformError", "NotFound"), () => Effect.succeedNone),
          Effect.mapError((cause) => new ManifestResolutionError({ cause, path: packageJsonPath }))
        )
      }

      const findFileOwner = (directoryPath: string) =>
        Effect.findFirst(PACKAGE_MANAGERS, ({ files }) =>
          Effect.findFirst(files, (file) => fs.exists(path.join(directoryPath, file))).pipe(
            Effect.map(Option.isSome)
          )
        ).pipe(Effect.map(Option.map(({ name }) => name)))

      // A folder decides the package manager when its package.json names one or it has one of
      // the files of a package manager. Otherwise the search moves to the parent folder.
      const detectIn = (directoryPath: string) =>
        Effect.gen(function* () {
          const declared = (yield* readPackageJson(directoryPath)).pipe(
            Option.flatMap(readDeclaredName)
          )

          if (Option.isSome(declared)) {
            return Result.succeed(declared.value)
          }

          // Deno reads its configuration before any lockfile, so deno.json decides first.
          if (yield* fs.exists(path.join(directoryPath, "deno.json"))) {
            return Result.succeed(Option.some<PackageManagerName>("deno"))
          }

          const owner = yield* findFileOwner(directoryPath)

          return Option.isSome(owner) ? Result.succeed(owner) : Result.fail(void 0)
        }).pipe(
          Effect.catchTag("PlatformError", (cause) =>
            Effect.fail(new ManifestResolutionError({ cause, path: directoryPath }))
          )
        )

      return {
        detect: Effect.fn("PackageManagerDetector.detect")((projectPath: string) =>
          Effect.findFirstFilter(
            ancestorDirectories(path, path.resolve(projectPath)),
            detectIn
          ).pipe(Effect.map(Option.flatten))
        ),
      }
    })
  )
}
