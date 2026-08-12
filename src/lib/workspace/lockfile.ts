import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Filter from "effect/Filter"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import type { PackageIdentity } from "#lib/core/packages.ts"
import { LockfileParseError } from "#lib/core/errors.ts"
import {
  emptyLockfile,
  LockfileSchema,
  type Lockfile,
  type PackageEntry,
} from "#lib/core/workspace.ts"
import { dropPackageEntries, putPackageEntry, validateLockfile } from "#lib/logic/workspace.ts"
import { formatJson } from "#lib/shared/json.ts"
import { LOCKFILE_NAME, PACKREF_DIRECTORY_NAME } from "#lib/workspace/paths.ts"

const LockfileJsonSchema = Schema.fromJsonString(LockfileSchema)
const decodeLockfile = Schema.decodeUnknownEffect(LockfileJsonSchema)
const encodeLockfile = Schema.encodeEffect(LockfileJsonSchema)

export const readLockfileAtPath = Effect.fn("readLockfileAtPath")(function* (lockfilePath: string) {
  const fs = yield* FileSystem.FileSystem
  const rawLockfile = yield* fs.readFileString(lockfilePath)
  const lockfile = yield* decodeLockfile(rawLockfile).pipe(
    Effect.mapError(
      (cause) =>
        new LockfileParseError({
          cause,
          path: lockfilePath,
        })
    )
  )

  return yield* validateLockfile(lockfile, lockfilePath)
})

export const writeLockfileAtPath = Effect.fn("writeLockfileAtPath")(function* (
  lockfilePath: string,
  lockfile: Lockfile
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const encodedLockfile = formatJson(yield* encodeLockfile(lockfile))

  yield* Effect.scoped(
    Effect.gen(function* () {
      const temporaryPath = yield* fs.makeTempFileScoped({
        directory: path.dirname(lockfilePath),
        prefix: ".packref-lock-",
        suffix: ".tmp",
      })

      yield* fs.writeFileString(temporaryPath, encodedLockfile)
      yield* fs.rename(temporaryPath, lockfilePath)
    })
  )
})

export const initializeLockfile = Effect.fn("initializeLockfile")(function* (projectPath: string) {
  const path = yield* Path.Path
  const lockfilePath = path.join(projectPath, PACKREF_DIRECTORY_NAME, LOCKFILE_NAME)

  return yield* readLockfileAtPath(lockfilePath).pipe(
    Effect.catchFilter(Filter.reason("PlatformError", "NotFound"), () =>
      writeLockfileAtPath(lockfilePath, emptyLockfile).pipe(Effect.as(emptyLockfile))
    )
  )
})

export const readProjectLockfile = Effect.fn("readProjectLockfile")(function* (
  projectPath: string
) {
  const path = yield* Path.Path

  return yield* readLockfileAtPath(path.join(projectPath, PACKREF_DIRECTORY_NAME, LOCKFILE_NAME))
})

export const upsertPackageEntry = Effect.fn("upsertPackageEntry")(function* (
  projectPath: string,
  entry: PackageEntry
) {
  const path = yield* Path.Path
  const lockfilePath = path.join(projectPath, PACKREF_DIRECTORY_NAME, LOCKFILE_NAME)
  const lockfile = yield* initializeLockfile(projectPath)
  const updatedLockfile = putPackageEntry(lockfile, entry)

  yield* writeLockfileAtPath(lockfilePath, updatedLockfile)

  return updatedLockfile
})

export const removePackageEntries = Effect.fn("removePackageEntries")(function* (
  projectPath: string,
  identities: readonly PackageIdentity[]
) {
  const path = yield* Path.Path
  const lockfilePath = path.join(projectPath, PACKREF_DIRECTORY_NAME, LOCKFILE_NAME)
  const lockfile = yield* readLockfileAtPath(lockfilePath)
  const updatedLockfile = dropPackageEntries(lockfile, identities)

  yield* writeLockfileAtPath(lockfilePath, updatedLockfile)

  return updatedLockfile
})
