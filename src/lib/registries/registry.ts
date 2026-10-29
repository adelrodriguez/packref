import type * as Effect from "effect/Effect"
import type { PackageIdentity } from "#lib/core/identity.ts"
import type { RegistryPackageSpec } from "#lib/core/packages.ts"
import type { Registry } from "#lib/core/registry.ts"
import type { RepositorySourceCandidate } from "#lib/core/source.ts"

export interface ResolvedPackageReference {
  readonly identity: PackageIdentity
  readonly repository?: RepositorySourceCandidate
  readonly tarballUrl: string
}

export interface RegistryAdapter<E = never, R = never> {
  readonly name: Registry
  /**
   * Maps a package name to the form the registry uses for its package identities.
   */
  readonly normalizeName: (name: string) => string
  readonly resolve: (spec: RegistryPackageSpec) => Effect.Effect<ResolvedPackageReference, E, R>
  /**
   * Lists repository tags that can hold the source of a package identity, in priority order.
   */
  readonly tagCandidates: (identity: PackageIdentity) => readonly string[]
}

export const defineRegistry = <E, R>(adapter: RegistryAdapter<E, R>) => adapter
