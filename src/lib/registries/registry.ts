import type * as Effect from "effect/Effect"
import type { UnsupportedRegistryError } from "#lib/core/errors.ts"
import type { PackageIdentity, ParsedPackageSpec } from "#lib/core/packages.ts"
import type { Registry } from "#lib/core/registry.ts"
import type { RepositorySourceCandidate } from "#lib/core/source.ts"

export interface ResolvedPackageReference {
  readonly identity: PackageIdentity
  readonly source: RepositorySourceCandidate
}

export interface RegistryAdapter<E = never, R = never> {
  readonly name: Registry
  readonly resolve: (
    spec: ParsedPackageSpec
  ) => Effect.Effect<ResolvedPackageReference, E | UnsupportedRegistryError, R>
}

export const defineRegistry = <E, R>(adapter: RegistryAdapter<E, R>) => adapter
