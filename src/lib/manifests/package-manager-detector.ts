import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { detectPackageManager, type PackageManagerName as NypmPackageManagerName } from "nypm"
import { ManifestResolutionError } from "#lib/core/errors.ts"

export type PackageManagerName = NypmPackageManagerName

export interface DetectedPackageManager {
  readonly lockFile?: string | readonly string[]
  readonly name: PackageManagerName
}

export interface PackageManagerDetectorService {
  readonly detect: (
    projectPath: string
  ) => Effect.Effect<DetectedPackageManager | undefined, ManifestResolutionError>
}

export class PackageManagerDetector extends Context.Service<
  PackageManagerDetector,
  PackageManagerDetectorService
>()("PackageManagerDetector") {
  static readonly layer = Layer.succeed(this)({
    detect: Effect.fn("PackageManagerDetector.detect")((projectPath: string) =>
      Effect.tryPromise({
        catch: (cause) =>
          new ManifestResolutionError({
            cause,
            path: projectPath,
          }),
        try: () =>
          detectPackageManager(projectPath, {
            ignoreArgv: true,
            includeParentDirs: true,
          }),
      })
    ),
  })
}
