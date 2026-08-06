import * as Effect from "effect/Effect"
import { StoreSourceMismatchError } from "#lib/core/errors.ts"
import { packageSourceEquivalence } from "#lib/core/source.ts"
import { fetchRepositorySnapshot } from "#lib/sources/repository/fetch.ts"
import { resolveRepositoryRef } from "#lib/sources/repository/normalize.ts"
import { fetchTarballSnapshot } from "#lib/sources/tarball/fetch.ts"
import { hasStoreEntry, readStoreEntry, type StoredEntry } from "#lib/store/store.ts"
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

  const resolvedRepository = yield* resolveRepositoryRef(entry, entry.source)
  const materialized = yield* fetchRepositorySnapshot(entry, resolvedRepository)
  return yield* ensureMatchingSource(entry, materialized)
})

export const installPackageReferences = Effect.fn("installPackageReferences")(function* (
  options: InstallPackageReferencesOptions = {}
) {
  const projectPath = yield* requireInitializedProject(options.projectPath)
  const lockfile = yield* readProjectLockfile(projectPath)
  const entries = listPackageEntries(lockfile)
  const alreadyInstalled: PackageEntry[] = []
  const fetched: PackageEntry[] = []
  const reused: PackageEntry[] = []

  yield* registerProject(projectPath)

  for (const entry of entries) {
    if (yield* hasProjectReference(projectPath, entry)) {
      alreadyInstalled.push(entry)
      continue
    }

    const reusedStoreEntry = yield* hasStoreEntry(entry)
    const storeEntry = yield* reusedStoreEntry
      ? readStoreEntry(entry).pipe(
          Effect.flatMap((storedEntry) => ensureMatchingSource(entry, storedEntry))
        )
      : fetchLockedStoreEntry(entry)

    yield* createProjectReference(projectPath, entry, storeEntry.path, entry.source)

    if (reusedStoreEntry) {
      reused.push(entry)
    } else {
      fetched.push(entry)
    }
  }

  return {
    alreadyInstalled,
    fetched,
    projectPath,
    reused,
  } satisfies InstallPackageReferencesResult
})
