import * as Effect from "effect/Effect"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import type { PackageIdentity } from "#lib/core/identity.ts"
import type { TarballSource } from "#lib/core/source.ts"
import { TarballFetchError } from "#lib/core/errors.ts"
import { extractArchive } from "#lib/sources/archive.ts"
import { materializeStoreEntry } from "#lib/store/index.ts"

const toTarballFetchError = (url: string) => (cause: unknown) =>
  new TarballFetchError({
    cause,
    url,
  })

export const fetchTarballSnapshot = Effect.fn("fetchTarballSnapshot")(function* (
  identity: PackageIdentity,
  tarballUrl: string
) {
  const source = {
    type: "tarball",
    url: tarballUrl,
  } satisfies TarballSource

  return yield* materializeStoreEntry(
    identity,
    source,
    (temporaryPath) =>
      // A registry tarball holds only files and directories, so it rejects every other entry.
      extractArchive(HttpClientRequest.get(tarballUrl), temporaryPath, { skip: [] }).pipe(
        Effect.mapError(({ cause }) => toTarballFetchError(tarballUrl)(cause))
      ),
    toTarballFetchError(tarballUrl)
  )
})
