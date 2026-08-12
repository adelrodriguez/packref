import type { PackageIdentity } from "#lib/core/packages.ts"
import type { ResolvedRepositoryRef } from "#lib/core/source.ts"

export interface RemoteRepositoryRefs {
  readonly head: string | undefined
  readonly heads: ReadonlyMap<string, string>
  readonly tags: ReadonlyMap<string, string>
}

export interface ResolvedDirectRepositoryRef {
  readonly identity: PackageIdentity
  readonly repository: ResolvedRepositoryRef
}
