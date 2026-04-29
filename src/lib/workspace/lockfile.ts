import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as PlatformError from "effect/PlatformError"
import * as Schema from "effect/Schema"
import { LockfileParseError } from "#lib/core/errors.ts"
import { RepositorySourceSchema } from "#lib/core/source.ts"
import { getProjectLockfilePath } from "#lib/workspace/paths.ts"

export const PackageEntrySchema = Schema.Struct({
  name: Schema.String,
  registry: Schema.String,
  source: RepositorySourceSchema,
  tracking: Schema.Union([Schema.Literal("manual"), Schema.Literal("dependency")]),
  version: Schema.String,
})
export type PackageEntry = typeof PackageEntrySchema.Type

export const LockfileSchema = Schema.Struct({
  packages: Schema.Array(PackageEntrySchema),
})
export type Lockfile = typeof LockfileSchema.Type

export const emptyLockfile: Lockfile = {
  packages: [],
}

export const readLockfileAtPath = (lockfilePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const rawLockfile = yield* fs.readFileString(lockfilePath)

    return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(LockfileSchema))(
      rawLockfile
    ).pipe(
      Effect.mapError(
        (cause) =>
          new LockfileParseError({
            cause,
            path: lockfilePath,
          })
      )
    )
  })

export const writeLockfileAtPath = (lockfilePath: string, lockfile: Lockfile) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const decodedLockfile = yield* Schema.decodeUnknownEffect(LockfileSchema)(lockfile)

    yield* fs.writeFileString(lockfilePath, `${JSON.stringify(decodedLockfile, null, 2)}\n`)
  })

export const initializeLockfile = (projectPath: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const lockfilePath = getProjectLockfilePath(path, projectPath)

    return yield* readLockfileAtPath(lockfilePath).pipe(
      Effect.catchTag("PlatformError", (error) => {
        if (error.reason instanceof PlatformError.SystemError && error.reason._tag === "NotFound") {
          return writeLockfileAtPath(lockfilePath, emptyLockfile).pipe(Effect.as(emptyLockfile))
        }

        return Effect.fail(error)
      })
    )
  })
