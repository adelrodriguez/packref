import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"
import { parseTarGzip, type ParsedTarFileItem } from "nanotar"
import type { PackageIdentity } from "#lib/core/packages.ts"
import type { TarballSource } from "#lib/core/source.ts"
import { TarballFetchError } from "#lib/core/errors.ts"
import { checkIsPathWithin } from "#lib/shared/path.ts"
import { materializeStoreEntry } from "#lib/store/index.ts"

const TAR_ENTRY_WRITE_CONCURRENCY = 8
const TAR_RETRY_COUNT = 2

const toTarballFetchError = (url: string) => (cause: unknown) =>
  new TarballFetchError({
    cause,
    url,
  })

const downloadTarball = Effect.fn("downloadTarball")(function* (url: string) {
  const httpClient = (yield* HttpClient.HttpClient).pipe(
    HttpClient.retryTransient({ times: TAR_RETRY_COUNT })
  )
  const archive = yield* httpClient.get(url).pipe(
    Effect.flatMap((response) => HttpClientResponse.filterStatusOk(response)),
    Effect.flatMap((response) => response.arrayBuffer),
    Effect.mapError(toTarballFetchError(url))
  )

  return new Uint8Array(archive)
})

const writeTarEntry = Effect.fn("writeTarEntry")(
  (entry: ParsedTarFileItem, archivePrefix: string, temporaryPath: string, tarballUrl: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const rawSegments = entry.name.split("/")

      if (
        entry.name.startsWith("/") ||
        entry.name.includes("\\") ||
        rawSegments.some((segment) => segment === "." || segment === "..")
      ) {
        return yield* new TarballFetchError({
          cause: `Archive entry contains an invalid path: ${entry.name}`,
          url: tarballUrl,
        })
      }

      if (!entry.name.startsWith(archivePrefix)) {
        return yield* new TarballFetchError({
          cause: `Archive entry does not use the expected ${archivePrefix} prefix: ${entry.name}`,
          url: tarballUrl,
        })
      }

      const relativePath = entry.name.slice(archivePrefix.length).replace(/\/+$/u, "")

      if (relativePath.length === 0) {
        return
      }

      const targetPath = path.resolve(temporaryPath, relativePath)

      if (!checkIsPathWithin(path, temporaryPath, targetPath)) {
        return yield* new TarballFetchError({
          cause: `Archive entry escapes the target directory: ${entry.name}`,
          url: tarballUrl,
        })
      }

      if (entry.type === "directory") {
        yield* fs.makeDirectory(targetPath, { recursive: true })
        return
      }

      if (entry.type !== "file" || entry.data === undefined) {
        return yield* new TarballFetchError({
          cause: `Archive entry type is not supported: ${entry.type ?? "unknown"}`,
          url: tarballUrl,
        })
      }

      yield* fs.makeDirectory(path.dirname(targetPath), { recursive: true })
      yield* fs.writeFile(targetPath, entry.data)

      if (entry.attrs?.mode !== undefined) {
        if (!/^[0-7]+$/u.test(entry.attrs.mode)) {
          return yield* new TarballFetchError({
            cause: `Archive entry contains an invalid mode: ${entry.attrs.mode}`,
            url: tarballUrl,
          })
        }

        yield* fs.chmod(targetPath, Number.parseInt(entry.attrs.mode, 8) & 0o777)
      }
    }).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(toTarballFetchError(tarballUrl)(cause))
      )
    )
)

const getArchivePrefix = (entries: readonly ParsedTarFileItem[], tarballUrl: string) =>
  Effect.gen(function* () {
    const roots = new Set(
      entries
        .map((entry) => entry.name.split("/")[0])
        .filter((root): root is string => root !== undefined && root.length > 0)
    )

    if (roots.size !== 1) {
      return yield* new TarballFetchError({
        cause: "Package archive must contain exactly one top-level directory",
        url: tarballUrl,
      })
    }

    const root = roots.values().next().value

    if (root === undefined || root === "." || root === "..") {
      return yield* new TarballFetchError({
        cause: "Package archive contains an invalid top-level directory",
        url: tarballUrl,
      })
    }

    return `${root}/`
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
      Effect.gen(function* () {
        const archive = yield* downloadTarball(tarballUrl)
        const entries = yield* Effect.tryPromise({
          catch: toTarballFetchError(tarballUrl),
          try: () => parseTarGzip(archive),
        })
        const archivePrefix = yield* getArchivePrefix(entries, tarballUrl)

        yield* Effect.forEach(
          entries,
          (entry) => writeTarEntry(entry, archivePrefix, temporaryPath, tarballUrl),
          { concurrency: TAR_ENTRY_WRITE_CONCURRENCY, discard: true }
        )
      }),
    toTarballFetchError(tarballUrl)
  )
})
