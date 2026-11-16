import type * as HttpClientRequest from "effect/http/HttpClientRequest"
import { createGunzip } from "node:zlib"
import * as NodeStream from "@effect/platform-node/NodeStream"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Tar from "effect/encoding/Tar"
import * as FileSystem from "effect/FileSystem"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Stream from "effect/Stream"
import { checkIsPathWithin } from "#lib/shared/path.ts"

const ENTRY_WRITE_CONCURRENCY = 8
const RETRY_COUNT = 2

/**
 * A failure to download or unpack an archive. Each source turns it into its own error.
 */
export class ArchiveError extends Data.TaggedError("ArchiveError")<{ readonly cause: unknown }> {}

export interface ExtractArchiveOptions {
  /**
   * Entry types to leave out instead of failing on them, such as the symlinks of a repository.
   */
  readonly skip: readonly Tar.EntryType[]
}

/**
 * An archive entry with its body read into memory, so that it can be written after the decoder
 * moves on to the next entry.
 */
interface ArchiveFile {
  readonly data: Uint8Array
  readonly header: Tar.Header
  readonly relativePath: string
}

const fail = (cause: string) => Effect.fail(new ArchiveError({ cause }))

const toArchiveError = (cause: unknown) => new ArchiveError({ cause })

const readEntries = (request: HttpClientRequest.HttpClientRequest) =>
  HttpClient.HttpClient.pipe(
    Effect.flatMap((httpClient) =>
      httpClient.pipe(HttpClient.retryTransient({ times: RETRY_COUNT })).execute(request)
    ),
    Effect.flatMap((response) => HttpClientResponse.filterStatusOk(response)),
    HttpClientResponse.stream,
    NodeStream.pipeThroughDuplex({ evaluate: () => createGunzip(), onError: (cause) => cause }),
    Stream.pipeThroughChannelOrFail(Tar.decode()),
    Stream.mapError(toArchiveError),
    // A body streams from the archive, so it fails with the errors of the download and the decoder.
    Stream.map((entry) => ({ ...entry, body: Stream.mapError(entry.body, toArchiveError) }))
  )

/**
 * Returns the top-level directory of an archive entry, such as `package/`, and the path of the
 * entry below it.
 */
const parseEntryPath = (entryPath: string) =>
  Effect.gen(function* () {
    const segments = entryPath.split("/")

    if (
      entryPath.startsWith("/")
      || entryPath.includes("\\")
      || segments.some((segment) => segment === "." || segment === "..")
    ) {
      return yield* fail(`Archive entry contains an invalid path: ${entryPath}`)
    }

    const [root = ""] = segments
    const prefix = `${root}/`

    if (!entryPath.startsWith(prefix)) {
      return yield* fail(`Archive entry does not use the expected ${prefix} prefix: ${entryPath}`)
    }

    return { prefix, relativePath: entryPath.slice(prefix.length).replace(/\/+$/u, "") }
  })

const writeEntry = Effect.fn("writeEntry")(
  ({ data, header, relativePath }: ArchiveFile, destination: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      if (relativePath.length === 0) {
        return
      }

      const targetPath = path.resolve(destination, relativePath)

      if (!checkIsPathWithin(path, destination, targetPath)) {
        return yield* fail(`Archive entry escapes the target directory: ${header.path}`)
      }

      if (header.type === "Directory") {
        yield* fs.makeDirectory(targetPath, { recursive: true })
        return
      }

      if (header.type !== "File") {
        return yield* fail(`Archive entry type is not supported: ${header.type}`)
      }

      yield* fs.makeDirectory(path.dirname(targetPath), { recursive: true })
      yield* fs.writeFile(targetPath, data)
      yield* fs.chmod(targetPath, header.mode & 0o777)
    }).pipe(Effect.catchTag("PlatformError", (cause) => Effect.fail(toArchiveError(cause))))
)

/**
 * Downloads the gzip-compressed tar archive of `request` and unpacks it into `destination`, without
 * its one top-level directory, such as `package/` in an npm tarball.
 */
export const extractArchive = Effect.fn("extractArchive")(function* (
  request: HttpClientRequest.HttpClientRequest,
  destination: string,
  options: ExtractArchiveOptions
) {
  const count = yield* readEntries(request).pipe(
    // The decoder streams each body once, so the bodies are read in archive order.
    Stream.mapAccumEffect(
      () => Option.none<string>(),
      (archivePrefix, entry) =>
        Effect.gen(function* () {
          const { prefix, relativePath } = yield* parseEntryPath(entry.header.path)

          if (Option.isSome(archivePrefix) && archivePrefix.value !== prefix) {
            return yield* fail("Package archive must contain exactly one top-level directory")
          }

          const data = yield* Stream.mkUint8Array(entry.body)
          const files = options.skip.includes(entry.header.type)
            ? []
            : [{ data, header: entry.header, relativePath }]

          return [Option.some(prefix), files] as const
        })
    ),
    Stream.mapEffect((file) => writeEntry(file, destination), {
      concurrency: ENTRY_WRITE_CONCURRENCY,
    }),
    Stream.runCount
  )

  if (count === 0) {
    return yield* fail("Package archive must contain exactly one top-level directory")
  }
})
