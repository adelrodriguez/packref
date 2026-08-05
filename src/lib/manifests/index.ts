import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { ManifestAdapter, ManifestDependency } from "#lib/manifests/manifest.ts"
import javascript from "#lib/manifests/javascript.ts"

const manifestAdapters = [javascript] satisfies ReadonlyArray<ManifestAdapter<unknown, unknown>>
const noManifestDependencies: readonly ManifestDependency[] = []

export const getManifestAdapter = Effect.fn("getManifestAdapter")(function* (projectPath: string) {
  return yield* Effect.findFirst(manifestAdapters, (adapter) => adapter.detect(projectPath))
})

export const readProjectDependencies = Effect.fn("readProjectDependencies")(function* (
  projectPath: string
) {
  const adapter = yield* getManifestAdapter(projectPath)

  return yield* Option.match(adapter, {
    onNone: () => Effect.succeed(noManifestDependencies),
    onSome: (adapter) => adapter.read(projectPath),
  })
})
