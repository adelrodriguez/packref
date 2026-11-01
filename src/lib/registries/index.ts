import * as Effect from "effect/Effect"
import type { ParsedPackageSpec, RegistryPackageSpec } from "#lib/core/packages.ts"
import type { RegistryAdapter } from "#lib/registries/registry.ts"
import { UnsupportedRegistryError } from "#lib/core/errors.ts"
import { checkIsRegistry, type Registry } from "#lib/core/registry.ts"
import npm from "#lib/registries/npm/resolver.ts"

const registryAdapters = {
  npm,
} satisfies Record<Registry, RegistryAdapter<unknown, unknown>>

export const getRegistryAdapter = (registry: string) =>
  Effect.gen(function* () {
    if (!checkIsRegistry(registry)) {
      return yield* new UnsupportedRegistryError({ registry })
    }

    return registryAdapters[registry]
  })

export const resolvePackageReference = (spec: RegistryPackageSpec) =>
  getRegistryAdapter(spec.registry).pipe(Effect.flatMap((adapter) => adapter.resolve(spec)))

export const normalizePackageSpec = Effect.fn("normalizePackageSpec")(function* (
  spec: ParsedPackageSpec
) {
  if (spec._tag === "repository") {
    return spec
  }

  const adapter = yield* getRegistryAdapter(spec.registry)

  return { ...spec, name: adapter.normalizeName(spec.name) } satisfies RegistryPackageSpec
})
