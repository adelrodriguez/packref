import type * as Effect from "effect/Effect"
import type { PackageIdentity, RegistryPackageSpec } from "#lib/core/packages.ts"
import type { Registry } from "#lib/core/registry.ts"
import type { RepositorySourceCandidate } from "#lib/core/source.ts"

export interface ResolvedPackageReference {
  readonly identity: PackageIdentity
  readonly repository?: RepositorySourceCandidate
  readonly tarballUrl: string
}

export interface RegistryAdapter<E = never, R = never> {
  readonly name: Registry
  readonly resolve: (spec: RegistryPackageSpec) => Effect.Effect<ResolvedPackageReference, E, R>
}

export const defineRegistry = <E, R>(adapter: RegistryAdapter<E, R>) => adapter
