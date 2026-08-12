import * as Effect from "effect/Effect"
import { defineRegistry } from "#lib/core/registry-adapter.ts"
import { resolveNpmPackage } from "#lib/logic/npm.ts"
import { NpmRegistryClient } from "#lib/registries/npm/client.ts"

export default defineRegistry({
  name: "npm",
  resolve: (spec) =>
    Effect.gen(function* () {
      const client = yield* NpmRegistryClient
      const metadata = yield* client.getPackageMetadata(spec.name)

      return yield* resolveNpmPackage(spec, metadata)
    }),
})
