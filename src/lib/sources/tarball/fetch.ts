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
import { materializeStoreEntry } from "#lib/store/store.ts"

const downloadTarball = Effect.fn("downloadTarball")(function* (url: string) {
  const httpClient = yield* HttpClient.HttpClient
  const archive = yield* httpClient.get(url).pipe(
    Effect.flatMap((response) => HttpClientResponse.filterStatusOk(response)),
    Effect.flatMap((response) => response.arrayBuffer),
    Effect.mapError(
      (cause) =>
        new TarballFetchError({
          cause,
          url,
        })
    )
  )

  return new Uint8Array(archive)
})

const writeTarEntry = Effect.fn("writeTarEntry")(function* (
  entry: ParsedTarFileItem,
  archivePrefix: string,
  temporaryPath: string,
  tarballUrl: string
) {
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
    yield* fs.chmod(targetPath, Number.parseInt(entry.attrs.mode, 8))
  }
})

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
          catch: (cause) =>
            new TarballFetchError({
              cause,
              url: tarballUrl,
            }),
          try: () => parseTarGzip(archive),
        })
        const archivePrefix = yield* getArchivePrefix(entries, tarballUrl)

        for (const entry of entries) {
          yield* writeTarEntry(entry, archivePrefix, temporaryPath, tarballUrl).pipe(
            Effect.catchTag("PlatformError", (cause) =>
              Effect.fail(
                new TarballFetchError({
                  cause,
                  url: tarballUrl,
                })
              )
            )
          )
        }
      }),
    (cause) =>
      new TarballFetchError({
        cause,
        url: tarballUrl,
      })
  )
})
