import * as Effect from "effect/Effect"
import type { PackageIdentity, RepositoryPackageSpec } from "#lib/core/packages.ts"
import type { RepositorySourceCandidate } from "#lib/core/source.ts"
import { UnsupportedRepositoryHostError } from "#lib/core/errors.ts"
import {
  normalizeRepositorySource,
  selectDirectRepositoryRef,
  selectPackageRepositoryRef,
} from "#lib/logic/repository.ts"
import { RemoteTagReader } from "#lib/sources/repository/tags.ts"

export const resolveDirectRepositoryRef = Effect.fn("resolveDirectRepositoryRef")(function* (
  spec: RepositoryPackageSpec
) {
  const source = yield* normalizeRepositorySource(spec.repository)

  if (source.fetchSource === undefined) {
    return yield* new UnsupportedRepositoryHostError({ host: source.host, url: source.url })
  }

  const remoteTagReader = yield* RemoteTagReader
  const refs = yield* remoteTagReader.listRefs(source)

  return yield* selectDirectRepositoryRef(spec, source, refs)
})

export const resolveRepositoryRef = Effect.fn("resolveRepositoryRef")(function* (
  identity: PackageIdentity,
  candidate: RepositorySourceCandidate
) {
  const source = yield* normalizeRepositorySource(candidate)

  if (source.fetchSource === undefined) {
    return yield* new UnsupportedRepositoryHostError({ host: source.host, url: source.url })
  }

  const remoteTagReader = yield* RemoteTagReader
  const tags = yield* remoteTagReader.list(source)

  return yield* selectPackageRepositoryRef(identity, source, tags)
})
