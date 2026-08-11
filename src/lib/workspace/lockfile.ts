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
import { LOCKFILE_NAME, PACKREF_DIRECTORY_NAME } from "#lib/workspace/paths.ts"

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
const decodeLockfile = Schema.decodeUnknownEffect(LockfileJsonSchema)
const encodeLockfile = Schema.encodeEffect(LockfileJsonSchema)

export const emptyLockfile: Lockfile = {
  packages: [],
}

const packageIdentityKey = (identity: PackageIdentity) =>
  `${identity.registry}:${identity.name}@${identity.version}`

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

  const packageIdentities = new Set<string>()

  for (const entry of lockfile.packages) {
    const identityKey = packageIdentityKey(entry)

    if (packageIdentities.has(identityKey)) {
      return yield* new LockfileParseError({
        cause: new Error(
          `Duplicate package identity: ${entry.registry}:${entry.name}@${entry.version}`
        ),
        path: lockfilePath,
      })
    }

    packageIdentities.add(identityKey)
  }

  return lockfile
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

export const listPackageEntries = (lockfile: Lockfile) =>
  lockfile.packages.toSorted((left, right) => packageIdentityOrder(left, right))

export const findPackageEntries = (lockfile: Lockfile, spec: ParsedPackageSpec) =>
  lockfile.packages
    .filter(
      (entry) =>
        entry.registry === spec.registry &&
        entry.name === spec.name &&
        (spec.specifier === undefined ||
          entry.version === spec.specifier ||
          (entry.source.type === "repository" && entry.source.requestedRef === spec.specifier))
    )
    .toSorted((left, right) => packageIdentityOrder(left, right))

export const upsertPackageEntry = Effect.fn("upsertPackageEntry")(function* (
  projectPath: string,
  entry: PackageEntry
) {
  const path = yield* Path.Path
  const lockfilePath = path.join(projectPath, PACKREF_DIRECTORY_NAME, LOCKFILE_NAME)
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
  const lockfilePath = path.join(projectPath, PACKREF_DIRECTORY_NAME, LOCKFILE_NAME)
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
