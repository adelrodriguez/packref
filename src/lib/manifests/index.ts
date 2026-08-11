import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type { ManifestAdapter, ManifestDependency } from "#lib/manifests/manifest.ts"
import { ManifestResolutionError } from "#lib/core/errors.ts"
import javascript from "#lib/manifests/javascript.ts"

const manifestAdapters = [javascript]

type DefaultManifestAdapter = (typeof manifestAdapters)[number]
type DefaultManifestError =
  DefaultManifestAdapter extends ManifestAdapter<infer E, infer _R> ? E : never

interface ProjectDependencyReaderService {
  readonly readProjectDependencies: (
    projectPath: string
  ) => Effect.Effect<Option.Option<readonly ManifestDependency[]>, DefaultManifestError>
}

export class ProjectDependencyReader extends Context.Service<
  ProjectDependencyReader,
  ProjectDependencyReaderService
>()("ProjectDependencyReader") {
  private static readonly makeLayer = <E, R>(
    adapters: ReadonlyArray<ManifestAdapter<E, R>>,
    mapError: (error: E, projectPath: string) => DefaultManifestError
  ) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const requirements = yield* Effect.context<R>()

        return {
          readProjectDependencies: Effect.fn("readProjectDependencies")(function* (
            projectPath: string
          ) {
            const dependencies: ManifestDependency[] = []
            const detectedManifest = yield* Effect.gen(function* () {
              let detected = false

              for (const adapter of adapters) {
                if (!(yield* adapter.detect(projectPath))) {
                  continue
                }

                detected = true
                dependencies.push(...(yield* adapter.read(projectPath)))
              }

              return detected
            }).pipe(Effect.mapError((error) => mapError(error, projectPath)))

            return detectedManifest
              ? Option.some([...dependencies])
              : Option.none<readonly ManifestDependency[]>()
          }, Effect.provide(requirements)),
        }
      })
    )

  static readonly layerWithAdapters = <E, R>(adapters: ReadonlyArray<ManifestAdapter<E, R>>) =>
    this.makeLayer(
      adapters,
      (cause, projectPath) => new ManifestResolutionError({ cause, path: projectPath })
    )

  static readonly layer = this.makeLayer(manifestAdapters, (error) => error)
}
