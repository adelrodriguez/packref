import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { downloadTemplate } from "giget"
import type { PackageIdentity } from "#lib/core/packages.ts"
import type { RepositorySource, ResolvedRepositoryRef } from "#lib/core/source.ts"
import { SnapshotFetchError } from "#lib/core/errors.ts"
import { materializeStoreEntry } from "#lib/store/index.ts"

interface RepositoryDownloaderService {
  readonly download: (
    source: string,
    ref: string,
    destination: string
  ) => Effect.Effect<void, SnapshotFetchError>
}

export class RepositoryDownloader extends Context.Service<
  RepositoryDownloader,
  RepositoryDownloaderService
>()("RepositoryDownloader") {
  static readonly layer = Layer.succeed(this)({
    download: Effect.fn("RepositoryDownloader.download")(function* (source, ref, destination) {
      const resolvedSource = `${source}#${ref}`

      yield* Effect.tryPromise({
        catch: (cause) =>
          new SnapshotFetchError({
            cause,
            source: resolvedSource,
          }),
        try: () =>
          downloadTemplate(resolvedSource, {
            dir: destination,
            force: true,
            install: false,
            registry: false,
            silent: true,
          }),
      })
    }),
  })
}

export const fetchRepositorySnapshot = Effect.fn("fetchRepositorySnapshot")(function* (
  identity: PackageIdentity,
  resolvedRepository: ResolvedRepositoryRef
) {
  const downloader = yield* RepositoryDownloader
  const fetchSource = resolvedRepository.source.fetchSource
  const source = {
    ...(resolvedRepository.source.directory === undefined
      ? {}
      : { directory: resolvedRepository.source.directory }),
    host: resolvedRepository.source.host,
    type: "repository",
    url: resolvedRepository.source.url,
  } satisfies RepositorySource

  return yield* materializeStoreEntry(
    identity,
    source,
    (temporaryPath) =>
      Effect.gen(function* () {
        if (fetchSource === undefined) {
          return yield* new SnapshotFetchError({
            cause: "Repository source is not fetchable",
            source: resolvedRepository.source.url,
          })
        }

        yield* downloader.download(fetchSource, resolvedRepository.ref, temporaryPath)
      }),
    (cause) =>
      new SnapshotFetchError({
        cause,
        source: fetchSource ?? resolvedRepository.source.url,
      })
  )
})
