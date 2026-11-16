import type * as FileSystem from "effect/FileSystem"
import type * as HttpClient from "effect/http/HttpClient"
import type * as Path from "effect/Path"
import type * as Types from "effect/Types"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Layer from "effect/Layer"
import type { PackageIdentity } from "#lib/core/identity.ts"
import type { RepositorySource, ResolvedRepositoryRef } from "#lib/core/source.ts"
import { SnapshotFetchError } from "#lib/core/errors.ts"
import { checkIsRepositoryProvider, type RepositoryProvider } from "#lib/core/repository.ts"
import { ArchiveError, extractArchive } from "#lib/sources/archive.ts"
import { materializeStoreEntry } from "#lib/store/index.ts"

// The owner and the name of a repository, without the folders that a longer URL path names.
const firstSegments = (repository: string) => repository.split("/").slice(0, 2).join("/")

/**
 * The archive of a repository at a ref, from each repository host. The URLs and headers match the
 * providers of giget 3, which Packref used before.
 */
const ARCHIVE_REQUESTS = {
  bitbucket: (repository, ref) =>
    HttpClientRequest.get(`https://bitbucket.org/${firstSegments(repository)}/get/${ref}.tar.gz`),
  github: (repository, ref) =>
    HttpClientRequest.get(
      `https://api.github.com/repos/${firstSegments(repository)}/tarball/${ref}`,
      {
        headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
      }
    ),
  // A GitLab project can sit in nested groups, so its path keeps every segment.
  gitlab: (repository, ref) =>
    HttpClientRequest.get(`https://gitlab.com/${repository}/-/archive/${ref}.tar.gz`, {
      headers: { "sec-fetch-mode": "same-origin" },
    }),
  sourcehut: (repository, ref) =>
    HttpClientRequest.get(`https://git.sr.ht/~${firstSegments(repository)}/archive/${ref}.tar.gz`),
} satisfies Record<
  RepositoryProvider,
  (repository: string, ref: string) => HttpClientRequest.HttpClientRequest
>

/**
 * Splits a fetch source, such as `github:owner/repo`, into its provider and repository path.
 */
const parseFetchSource = Effect.fnUntraced(function* (source: string) {
  const separator = source.indexOf(":")
  const provider = source.slice(0, separator)

  if (separator <= 0 || !checkIsRepositoryProvider(provider)) {
    return yield* new ArchiveError({
      cause: `Repository source has no supported provider: ${source}`,
    })
  }

  return { provider, repository: source.slice(separator + 1) }
})

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
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const services = yield* Effect.context<
        FileSystem.FileSystem | HttpClient.HttpClient | Path.Path
      >()

      return {
        download: Effect.fn("RepositoryDownloader.download")((source, ref, destination) =>
          parseFetchSource(source).pipe(
            // A repository can link files to each other or to paths outside it, so the reference
            // leaves its symlinks out.
            Effect.flatMap(({ provider, repository }) =>
              extractArchive(ARCHIVE_REQUESTS[provider](repository, ref), destination, {
                skip: ["Symlink"],
              })
            ),
            Effect.provideContext(services),
            Effect.mapError(
              ({ cause }) => new SnapshotFetchError({ cause, source: `${source}#${ref}` })
            )
          )
        ),
      }
    })
  )
}

export interface FetchRepositorySnapshotOptions {
  readonly includeDirectory?: boolean
}

export const fetchRepositorySnapshot = Effect.fn("fetchRepositorySnapshot")(function* (
  identity: PackageIdentity,
  resolvedRepository: ResolvedRepositoryRef,
  options: FetchRepositorySnapshotOptions = {}
) {
  const downloader = yield* RepositoryDownloader
  const fetchSource = resolvedRepository.source.fetchSource

  const source: Types.Mutable<RepositorySource> = {
    host: resolvedRepository.source.host,
    type: "repository",
    url: resolvedRepository.source.url,
  }

  if (options.includeDirectory !== false && resolvedRepository.source.directory !== undefined) {
    source.directory = resolvedRepository.source.directory
  }

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
