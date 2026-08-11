import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import {
  InstallPackageReferencesError,
  StoreSourceMismatchError,
  UnsupportedRepositoryHostError,
} from "#lib/core/errors.ts"
import { SUPPORTED_REPOSITORY_PROVIDERS } from "#lib/core/packages.ts"
import { packageSourceEquivalence } from "#lib/core/source.ts"
import { fetchRepositorySnapshot } from "#lib/sources/repository/fetch.ts"
import {
  normalizeRepositorySource,
  resolveRepositoryRef,
} from "#lib/sources/repository/normalize.ts"
import { fetchTarballSnapshot } from "#lib/sources/tarball/fetch.ts"
import { hasStoreEntry, readStoreEntry, type StoredEntry } from "#lib/store/index.ts"
import { registerProject } from "#lib/workspace/config.ts"
import {
  listPackageEntries,
  readProjectLockfile,
  type PackageEntry,
} from "#lib/workspace/lockfile.ts"
import {
  createProjectReference,
  hasProjectReference,
  requireInitializedProject,
} from "#lib/workspace/project.ts"

export interface InstallPackageReferencesOptions {
  readonly projectPath?: string
}

const INSTALL_CONCURRENCY = 8

export interface InstallPackageReferencesResult {
  readonly alreadyInstalled: readonly PackageEntry[]
  readonly fetched: readonly PackageEntry[]
  readonly projectPath: string
  readonly reused: readonly PackageEntry[]
}

const ensureMatchingSource = Effect.fn("ensureMatchingSource")(function* (
  entry: PackageEntry,
  storedEntry: StoredEntry
) {
  if (!packageSourceEquivalence(entry.source, storedEntry.source)) {
    return yield* new StoreSourceMismatchError({
      name: entry.name,
      registry: entry.registry,
      version: entry.version,
    })
  }

  return storedEntry
})

const fetchLockedStoreEntry = Effect.fn("fetchLockedStoreEntry")(function* (entry: PackageEntry) {
  if (entry.source.type === "tarball") {
    const materialized = yield* fetchTarballSnapshot(entry, entry.source.url)
    return yield* ensureMatchingSource(entry, materialized)
  }

  const isDirectRepository = SUPPORTED_REPOSITORY_PROVIDERS.some(
    (provider) => provider === entry.registry
  )
  const resolvedRepository = isDirectRepository
    ? yield* Effect.gen(function* () {
        const source = yield* normalizeRepositorySource(entry.source)

        if (source.fetchSource === undefined) {
          return yield* new UnsupportedRepositoryHostError({ host: source.host, url: source.url })
        }

        return { ref: entry.version, source }
      })
    : yield* resolveRepositoryRef(entry, entry.source)
  const materialized = yield* fetchRepositorySnapshot(entry, resolvedRepository)
  return yield* ensureMatchingSource(entry, materialized)
})

type InstallEntryResult =
  | { readonly entry: PackageEntry; readonly type: "already-installed" }
  | { readonly entry: PackageEntry; readonly type: "fetched" }
  | { readonly entry: PackageEntry; readonly type: "reused" }

type InstallAttempt =
  | { readonly entry: PackageEntry; readonly error: unknown; readonly type: "failure" }
  | { readonly result: InstallEntryResult; readonly type: "success" }

const installPackageReference = Effect.fn("installPackageReference")(function* (
  projectPath: string,
  entry: PackageEntry
) {
  if (yield* hasProjectReference(projectPath, entry)) {
    return { entry, type: "already-installed" } satisfies InstallEntryResult
  }

  const reusedStoreEntry = yield* hasStoreEntry(entry)
  const storeEntry = yield* reusedStoreEntry
    ? readStoreEntry(entry).pipe(
        Effect.flatMap((storedEntry) => ensureMatchingSource(entry, storedEntry))
      )
    : fetchLockedStoreEntry(entry)

  yield* createProjectReference(projectPath, entry, storeEntry.path, entry.source)

  return {
    entry,
    type: reusedStoreEntry ? "reused" : "fetched",
  } satisfies InstallEntryResult
})

export const installPackageReferences = Effect.fn("installPackageReferences")(function* (
  options: InstallPackageReferencesOptions = {}
) {
  const projectPath = yield* requireInitializedProject(options.projectPath)
  const lockfile = yield* readProjectLockfile(projectPath)
  const entries = listPackageEntries(lockfile)
  yield* registerProject(projectPath)

  const attempts = yield* Effect.forEach(
    entries,
    (entry) =>
      installPackageReference(projectPath, entry).pipe(
        Effect.match({
          onFailure: (error) => ({ entry, error, type: "failure" }) satisfies InstallAttempt,
          onSuccess: (result) => ({ result, type: "success" }) satisfies InstallAttempt,
        })
      ),
    { concurrency: INSTALL_CONCURRENCY }
  )
  const [failures, results] = Array.partition(attempts, (attempt) =>
    attempt.type === "success"
      ? Result.succeed(attempt.result)
      : Result.fail({ cause: attempt.error, identity: attempt.entry })
  )

  if (failures.length > 0) {
    return yield* new InstallPackageReferencesError({ failures })
  }

  const [alreadyInstalled, pending] = Array.partition(results, (result) =>
    result.type === "already-installed" ? Result.fail(result.entry) : Result.succeed(result)
  )
  const [fetched, reused] = Array.partition(pending, (result) =>
    result.type === "reused" ? Result.succeed(result.entry) : Result.fail(result.entry)
  )

  return {
    alreadyInstalled,
    fetched,
    projectPath,
    reused,
  } satisfies InstallPackageReferencesResult
})
