import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import type { ParsedPackageSpec } from "#lib/core/packages.ts"
import { PackageNotReferencedError } from "#lib/core/errors.ts"
import { getStorePackagePath } from "#lib/store/paths.ts"
import {
  findPackageEntries,
  readProjectLockfile,
  removePackageEntries,
  type PackageEntry,
} from "#lib/workspace/lockfile.ts"
import { getDirectoryPath } from "#lib/workspace/paths.ts"
import { requireInitializedProject } from "#lib/workspace/project.ts"

export interface PackageReferenceOptions {
  readonly projectPath?: string
}

export const findPackageReferenceMatches = Effect.fn("findPackageReferenceMatches")(function* (
  spec: ParsedPackageSpec,
  options: PackageReferenceOptions = {}
) {
  const projectPath = yield* requireInitializedProject(options.projectPath)
  const lockfile = yield* readProjectLockfile(projectPath)
  const entries = findPackageEntries(lockfile, spec)

  if (entries.length === 0) {
    return yield* new PackageNotReferencedError({
      name: spec.name,
      registry: spec.registry,
      ...(spec.specifier === undefined ? {} : { version: spec.specifier }),
    })
  }

  return {
    entries,
    projectPath,
  }
})

export const removePackageReferences = Effect.fn("removePackageReferences")(function* (
  projectPath: string,
  entries: readonly PackageEntry[]
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const projectDirectoryPath = getDirectoryPath(path, projectPath)
  const missingEntries: PackageEntry[] = []

  for (const entry of entries) {
    const referencePath = yield* getStorePackagePath(projectDirectoryPath, entry)

    if (!(yield* fs.exists(referencePath))) {
      missingEntries.push(entry)
      continue
    }

    yield* fs.remove(referencePath, { force: true, recursive: true })
  }

  yield* removePackageEntries(projectPath, entries)

  return {
    missingEntries,
    removedEntries: entries,
  }
})
