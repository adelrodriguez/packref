import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import type { GlobalConfig, Lockfile, PackageEntry } from "#lib/core/workspace.ts"
import { LockfileParseError } from "#lib/core/errors.ts"
import {
  packageIdentityEquivalence,
  packageIdentityOrder,
  type PackageIdentity,
  type ParsedPackageSpec,
} from "#lib/core/packages.ts"

export const addProject = (config: GlobalConfig, projectPath: string): GlobalConfig =>
  config.projects.includes(projectPath)
    ? config
    : Object.freeze({ projects: Object.freeze([...config.projects, projectPath]) })

export const removeProjects = (
  config: GlobalConfig,
  projectPaths: readonly string[]
): GlobalConfig => {
  const projects = config.projects.filter((projectPath) => !projectPaths.includes(projectPath))

  return projects.length === config.projects.length
    ? config
    : Object.freeze({ projects: Object.freeze(projects) })
}

const packageIdentityKey = (identity: PackageIdentity) =>
  `${identity.registry}:${identity.name}@${identity.version}`

export const validateLockfile = Effect.fn("validateLockfile")(function* (
  lockfile: Lockfile,
  path: string
): Effect.fn.Return<Lockfile, LockfileParseError> {
  const identities = new Set<string>()

  for (const entry of lockfile.packages) {
    const identity = packageIdentityKey(entry)

    if (identities.has(identity)) {
      return yield* new LockfileParseError({
        cause: new Error(`Duplicate package identity: ${identity}`),
        path,
      })
    }

    identities.add(identity)
  }

  return lockfile
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

export const putPackageEntry = (lockfile: Lockfile, entry: PackageEntry): Lockfile => {
  const existingIndex = lockfile.packages.findIndex((candidate) =>
    packageIdentityEquivalence(candidate, entry)
  )
  const packages =
    existingIndex === -1
      ? [...lockfile.packages, entry]
      : lockfile.packages.map((candidate, index) => (index === existingIndex ? entry : candidate))

  return Object.freeze({ packages: Object.freeze(packages) })
}

export const dropPackageEntries = (
  lockfile: Lockfile,
  identities: readonly PackageIdentity[]
): Lockfile =>
  Object.freeze({
    packages: Object.freeze(
      lockfile.packages.filter(
        (entry) => !Array.containsWith(packageIdentityEquivalence)(identities, entry)
      )
    ),
  })
