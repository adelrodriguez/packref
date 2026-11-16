import { createGunzip } from "node:zlib"
import * as NodeStream from "@effect/platform-node/NodeStream"
import * as Effect from "effect/Effect"
import * as Tar from "effect/encoding/Tar"
import * as FileSystem from "effect/FileSystem"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Stream from "effect/Stream"
import type { PackageIdentity } from "#lib/core/identity.ts"
import type { TarballSource } from "#lib/core/source.ts"
import { TarballFetchError } from "#lib/core/errors.ts"
import { checkIsPathWithin } from "#lib/shared/path.ts"
import { materializeStoreEntry } from "#lib/store/index.ts"

const TAR_ENTRY_WRITE_CONCURRENCY = 8
const TAR_RETRY_COUNT = 2

/**
 * An archive entry with its body read into memory, so that it can be written after the decoder
 * moves on to the next entry.
 */
interface ArchiveFile {
  readonly data: Uint8Array
  readonly header: Tar.Header
  readonly relativePath: string
}

const toTarballFetchError = (url: string) => (cause: unknown) =>
  new TarballFetchError({
    cause,
    url,
  })

const readTarballEntries = (url: string) =>
  HttpClient.HttpClient.pipe(
    Effect.flatMap((httpClient) =>
      httpClient.pipe(HttpClient.retryTransient({ times: TAR_RETRY_COUNT })).get(url)
    ),
    Effect.flatMap((response) => HttpClientResponse.filterStatusOk(response)),
    HttpClientResponse.stream,
    NodeStream.pipeThroughDuplex({ evaluate: () => createGunzip(), onError: (cause) => cause }),
    Stream.pipeThroughChannelOrFail(Tar.decode()),
    Stream.mapError(toTarballFetchError(url)),
    // A body streams from the archive, so it fails with the errors of the download and the decoder.
    Stream.map((entry) => ({
      ...entry,
      body: Stream.mapError(entry.body, toTarballFetchError(url)),
    }))
  )

/**
 * Returns the top-level directory of an archive entry, such as `package/`, and the path of the
 * entry below it.
 */
const parseEntryPath = (entryPath: string, tarballUrl: string) =>
  Effect.gen(function* () {
    const segments = entryPath.split("/")

    if (
      entryPath.startsWith("/")
      || entryPath.includes("\\")
      || segments.some((segment) => segment === "." || segment === "..")
    ) {
      return yield* new TarballFetchError({
        cause: `Archive entry contains an invalid path: ${entryPath}`,
        url: tarballUrl,
      })
    }

    const [root = ""] = segments
    const prefix = `${root}/`

    if (!entryPath.startsWith(prefix)) {
      return yield* new TarballFetchError({
        cause: `Archive entry does not use the expected ${prefix} prefix: ${entryPath}`,
        url: tarballUrl,
      })
    }

    return { prefix, relativePath: entryPath.slice(prefix.length).replace(/\/+$/u, "") }
  })

const writeTarEntry = Effect.fn("writeTarEntry")(
  ({ data, header, relativePath }: ArchiveFile, temporaryPath: string, tarballUrl: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      if (relativePath.length === 0) {
        return
      }

      const targetPath = path.resolve(temporaryPath, relativePath)

      if (!checkIsPathWithin(path, temporaryPath, targetPath)) {
        return yield* new TarballFetchError({
          cause: `Archive entry escapes the target directory: ${header.path}`,
          url: tarballUrl,
        })
      }

      if (header.type === "Directory") {
        yield* fs.makeDirectory(targetPath, { recursive: true })
        return
      }

      if (header.type !== "File") {
        return yield* new TarballFetchError({
          cause: `Archive entry type is not supported: ${header.type}`,
          url: tarballUrl,
        })
      }

      yield* fs.makeDirectory(path.dirname(targetPath), { recursive: true })
      yield* fs.writeFile(targetPath, data)
      yield* fs.chmod(targetPath, header.mode & 0o777)
    }).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(toTarballFetchError(tarballUrl)(cause))
      )
    )
)

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
      readTarballEntries(tarballUrl).pipe(
        // The decoder streams each body once, so the bodies are read in archive order.
        Stream.mapAccumEffect(
          () => Option.none<string>(),
          (archivePrefix, entry) =>
            Effect.gen(function* () {
              const { prefix, relativePath } = yield* parseEntryPath(entry.header.path, tarballUrl)

              if (Option.isSome(archivePrefix) && archivePrefix.value !== prefix) {
                return yield* new TarballFetchError({
                  cause: "Package archive must contain exactly one top-level directory",
                  url: tarballUrl,
                })
              }

              const data = yield* Stream.mkUint8Array(entry.body)

              return [Option.some(prefix), [{ data, header: entry.header, relativePath }]] as const
            })
        ),
        Stream.mapEffect((file) => writeTarEntry(file, temporaryPath, tarballUrl), {
          concurrency: TAR_ENTRY_WRITE_CONCURRENCY,
        }),
        Stream.runCount,
        Effect.filterOrFail(
          (count) => count > 0,
          () =>
            new TarballFetchError({
              cause: "Package archive must contain exactly one top-level directory",
              url: tarballUrl,
            })
        )
      ),
    toTarballFetchError(tarballUrl)
  )
})
