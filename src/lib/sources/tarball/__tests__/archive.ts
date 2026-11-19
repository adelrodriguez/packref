import { createGzip } from "node:zlib"
import * as NodeStream from "@effect/platform-node/NodeStream"
import * as Effect from "effect/Effect"
import * as Tar from "effect/encoding/Tar"
import * as Stream from "effect/Stream"

/**
 * Builds a gzip-compressed tar archive, like a package tarball of a registry, from `entries`.
 */
export const makeArchive = (entries: readonly Tar.Entry[]) =>
  Effect.runPromise(
    Stream.fromIterable(entries).pipe(
      Stream.pipeThroughChannelOrFail(Tar.encode()),
      NodeStream.pipeThroughDuplex({ evaluate: () => createGzip() }),
      Stream.mkUint8Array
    )
  )
