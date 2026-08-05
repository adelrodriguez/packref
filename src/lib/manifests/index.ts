import * as Effect from "effect/Effect"
import type { ManifestAdapter } from "#lib/manifests/manifest.ts"
import javascript from "#lib/manifests/javascript.ts"

const manifestAdapters = [javascript] satisfies ReadonlyArray<ManifestAdapter<unknown, unknown>>

export const getManifestAdapter = Effect.fn("getManifestAdapter")(function* (projectPath: string) {
  for (const adapter of manifestAdapters) {
    if (yield* adapter.detect(projectPath)) {
      return adapter
    }
  }

  return void 0
})

export const readProjectDependencies = Effect.fn("readProjectDependencies")(function* (
  projectPath: string
) {
  const adapter = yield* getManifestAdapter(projectPath)

  return adapter === undefined ? [] : yield* adapter.read(projectPath)
})
