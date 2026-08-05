import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Filter from "effect/Filter"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { LockfileParseError } from "#lib/core/errors.ts"
import {
  packageIdentityEquivalence,
  packageIdentityOrder,
  type PackageIdentity,
  type ParsedPackageSpec,
} from "#lib/core/packages.ts"
import { PackageSourceSchema } from "#lib/core/source.ts"
import { formatJson } from "#lib/shared/json.ts"
import { getProjectLockfilePath } from "#lib/workspace/paths.ts"

export const PackageEntrySchema = Schema.Struct({
  name: Schema.String,
  registry: Schema.String,
  source: PackageSourceSchema,
  tracking: Schema.Union([Schema.Literal("manual"), Schema.Literal("dependency")]),
  version: Schema.String,
})
export type PackageEntry = typeof PackageEntrySchema.Type

export const LockfileSchema = Schema.Struct({
  packages: Schema.Array(PackageEntrySchema),
})
export type Lockfile = typeof LockfileSchema.Type

const LockfileJsonSchema = Schema.fromJsonString(LockfileSchema)

export const emptyLockfile: Lockfile = {
  packages: [],
}

export const readLockfileAtPath = (lockfilePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const rawLockfile = yield* fs.readFileString(lockfilePath)

    return yield* Schema.decodeUnknownEffect(LockfileJsonSchema)(rawLockfile).pipe(
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
    const path = yield* Path.Path
    const encodedLockfile = formatJson(yield* Schema.encodeEffect(LockfileJsonSchema)(lockfile))

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

export const initializeLockfile = (projectPath: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const lockfilePath = getProjectLockfilePath(path, projectPath)

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

  return yield* readLockfileAtPath(getProjectLockfilePath(path, projectPath))
})

export const listPackageEntries = (lockfile: Lockfile) =>
  lockfile.packages.toSorted((left, right) => packageIdentityOrder(left, right))

export const findPackageEntries = (lockfile: Lockfile, spec: ParsedPackageSpec) =>
  lockfile.packages
    .filter(
      (entry) =>
        entry.registry === spec.registry &&
        entry.name === spec.name &&
        (spec.specifier === undefined || entry.version === spec.specifier)
    )
    .toSorted((left, right) => packageIdentityOrder(left, right))

export const upsertPackageEntry = (projectPath: string, entry: PackageEntry) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const lockfilePath = getProjectLockfilePath(path, projectPath)
    const lockfile = yield* initializeLockfile(projectPath)
    const existingIndex = lockfile.packages.findIndex((candidate) =>
      packageIdentityEquivalence(candidate, entry)
    )
    const packages =
      existingIndex === -1
        ? [...lockfile.packages, entry]
        : lockfile.packages.map((candidate, index) => (index === existingIndex ? entry : candidate))
    const updatedLockfile = {
      packages,
    } satisfies Lockfile

    yield* writeLockfileAtPath(lockfilePath, updatedLockfile)

    return updatedLockfile
  })

export const removePackageEntries = Effect.fn("removePackageEntries")(function* (
  projectPath: string,
  identities: readonly PackageIdentity[]
) {
  const path = yield* Path.Path
  const lockfilePath = getProjectLockfilePath(path, projectPath)
  const lockfile = yield* readLockfileAtPath(lockfilePath)
  const packages = lockfile.packages.filter(
    (entry) => !Array.containsWith(packageIdentityEquivalence)(identities, entry)
  )
  const updatedLockfile = {
    packages,
  } satisfies Lockfile

  yield* writeLockfileAtPath(lockfilePath, updatedLockfile)

  return updatedLockfile
})
