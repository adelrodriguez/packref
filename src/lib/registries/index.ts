import * as Effect from "effect/Effect"
import type { ParsedPackageSpec } from "#lib/core/packages.ts"
import type { RegistryAdapter } from "#lib/registries/registry.ts"
import { UnsupportedRegistryError } from "#lib/core/errors.ts"
import npm from "#lib/registries/npm/resolver.ts"

const registryAdapters = [npm] satisfies ReadonlyArray<RegistryAdapter<unknown, unknown>>

export const getRegistryAdapter = (registry: string) =>
  Effect.gen(function* () {
    const adapter = registryAdapters.find((candidate) => candidate.name === registry)

    if (adapter !== undefined) {
      return adapter
    }

    return yield* new UnsupportedRegistryError({ registry })
  })

export const resolvePackageReference = (spec: ParsedPackageSpec) =>
  Effect.gen(function* () {
    const adapter = yield* getRegistryAdapter(spec.registry)

    return yield* adapter.resolve(spec)
  })
