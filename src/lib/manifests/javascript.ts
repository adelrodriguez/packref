import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Filter from "effect/Filter"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { detectPackageManager, type PackageManagerName } from "nypm"
import { valid } from "semver"
import { ManifestParseError, ManifestResolutionError } from "#lib/core/errors.ts"
import {
  DEPENDENCY_GROUPS,
  defineManifest,
  type ManifestDependency,
} from "#lib/manifests/manifest.ts"

const DependencyRecordSchema = Schema.Record(Schema.String, Schema.String)

export const JavascriptPackageManifestSchema = Schema.StructWithRest(
  Schema.Struct({
    dependencies: Schema.optional(DependencyRecordSchema),
    devDependencies: Schema.optional(DependencyRecordSchema),
    peerDependencies: Schema.optional(DependencyRecordSchema),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
)

const InstalledPackageSchema = Schema.StructWithRest(
  Schema.Struct({
    version: Schema.String,
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
)

const NpmLockfileSchema = Schema.StructWithRest(
  Schema.Struct({
    dependencies: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    packages: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
)

const NpmLockfileEntrySchema = Schema.StructWithRest(
  Schema.Struct({
    version: Schema.String,
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
)

interface LockedVersionDependency {
  readonly name: string
  readonly specifier: string
}

interface LockfileResolutionRequest extends LockedVersionDependency {
  readonly projectRelativePath: string
}

interface Lockfile {
  readonly isText?: boolean
  readonly name: string
}

interface PackageManagerLockfileStrategy {
  readonly lockfiles: readonly Lockfile[]
  readonly resolve: (rawLockfile: string, request: LockfileResolutionRequest) => string | undefined
}

interface PackageManagerResolverService {
  readonly resolveLockedVersions: (
    projectPath: string,
    dependencies: readonly LockedVersionDependency[]
  ) => Effect.Effect<
    ReadonlyMap<string, string>,
    ManifestResolutionError,
    FileSystem.FileSystem | Path.Path
  >
}

const escapeRegularExpression = (value: string) =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)

const unquoteYamlValue = (value: string) => value.replaceAll(/^["']|["']$/gu, "")

export const resolveBunLockVersion = (rawLockfile: string, name: string) => {
  const escapedName = escapeRegularExpression(name)
  const match = new RegExp(
    String.raw`^\s*"${escapedName}":\s*\[\s*"${escapedName}@([^"]+)"`,
    "mu"
  ).exec(rawLockfile)

  return match?.[1]
}

export const resolveYarnLockVersion = (rawLockfile: string, name: string, specifier: string) => {
  const selectors = new Set([`${name}@${specifier}`, `${name}@npm:${specifier}`])

  for (const block of rawLockfile.split(/\n(?=\S)/u)) {
    const [header = ""] = block.split("\n")
    const headerSelectors = header
      .trim()
      .replace(/:\s*$/u, "")
      .split(",")
      .map((value) => unquoteYamlValue(value.trim()))

    if (!headerSelectors.some((selector) => selectors.has(selector))) {
      continue
    }

    const versionMatch = /^\s+version:?\s+["']?([^"'\s]+)["']?\s*$/mu.exec(block)

    if (versionMatch?.[1] !== undefined) {
      return versionMatch[1]
    }
  }

  return void 0
}

const getYamlMappingBlock = (source: string, key: string, indentation: number) => {
  const lines = source.split(/\r?\n/u)
  const keyPattern = new RegExp(
    String.raw`^\s{${indentation}}["']?${escapeRegularExpression(key)}["']?:\s*$`,
    "u"
  )
  const startIndex = lines.findIndex((line) => keyPattern.test(line))

  if (startIndex === -1) {
    return
  }

  let endIndex = lines.length

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]

    if (line === undefined || line.trim().length === 0) {
      continue
    }

    const lineIndentation = line.match(/^\s*/u)?.[0].length ?? 0

    if (lineIndentation <= indentation) {
      endIndex = index
      break
    }
  }

  return lines.slice(startIndex + 1, endIndex).join("\n")
}

const normalizePnpmVersion = (value: string) => unquoteYamlValue(value).replace(/\(.+$/u, "").trim()

const resolvePnpmDependencyFromBlock = (source: string, name: string) => {
  const escapedName = escapeRegularExpression(name)
  const lines = source.split(/\r?\n/u)
  const dependencyPattern = new RegExp(
    String.raw`^(?<indentation>\s+)["']?${escapedName}["']?:\s*(?<value>.*?)\s*$`,
    "u"
  )

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = line === undefined ? undefined : dependencyPattern.exec(line)

    if (match?.groups === undefined) {
      continue
    }

    const inlineValue = match.groups.value

    if (inlineValue !== undefined && inlineValue.length > 0) {
      const version = normalizePnpmVersion(inlineValue)

      if (valid(version) !== null) {
        return version
      }

      continue
    }

    const indentation = match.groups.indentation?.length ?? 0

    for (let nestedIndex = index + 1; nestedIndex < lines.length; nestedIndex += 1) {
      const nestedLine = lines[nestedIndex]

      if (nestedLine === undefined || nestedLine.trim().length === 0) {
        continue
      }

      const nestedIndentation = nestedLine.match(/^\s*/u)?.[0].length ?? 0

      if (nestedIndentation <= indentation) {
        break
      }

      const versionMatch = /^\s+version:\s*(.+?)\s*$/u.exec(nestedLine)

      if (versionMatch?.[1] !== undefined) {
        const version = normalizePnpmVersion(versionMatch[1])

        if (valid(version) !== null) {
          return version
        }
      }
    }
  }

  return void 0
}

export const resolvePnpmLockVersion = (
  rawLockfile: string,
  name: string,
  projectRelativePath = "."
) => {
  const importers = getYamlMappingBlock(rawLockfile, "importers", 0)

  if (importers !== undefined) {
    const importer = getYamlMappingBlock(importers, projectRelativePath, 2)

    return importer === undefined ? void 0 : resolvePnpmDependencyFromBlock(importer, name)
  }

  return resolvePnpmDependencyFromBlock(rawLockfile, name)
}

export const resolveNpmLockVersion = (
  rawLockfile: string,
  name: string,
  projectRelativePath = "."
) => {
  const lockfile = Option.getOrUndefined(
    Schema.decodeUnknownOption(Schema.fromJsonString(NpmLockfileSchema))(rawLockfile)
  )

  if (lockfile === undefined) {
    return void 0
  }

  const workspacePackagePath =
    projectRelativePath === "." ? undefined : `${projectRelativePath}/node_modules/${name}`
  const rawEntry =
    (workspacePackagePath === undefined ? undefined : lockfile.packages?.[workspacePackagePath]) ??
    lockfile.packages?.[`node_modules/${name}`] ??
    lockfile.dependencies?.[name]
  const entry = Option.getOrUndefined(Schema.decodeUnknownOption(NpmLockfileEntrySchema)(rawEntry))

  return entry?.version
}

const packageManagerLockfileStrategies: Partial<
  Record<PackageManagerName, PackageManagerLockfileStrategy>
> = {
  bun: {
    lockfiles: [
      { name: "bun.lock" },
      // bun.lockb is binary, so fall through to node_modules instead of parsing it.
      { isText: false, name: "bun.lockb" },
    ],
    resolve: (rawLockfile, request) => resolveBunLockVersion(rawLockfile, request.name),
  },
  npm: {
    lockfiles: [{ name: "package-lock.json" }, { name: "npm-shrinkwrap.json" }],
    resolve: (rawLockfile, request) =>
      resolveNpmLockVersion(rawLockfile, request.name, request.projectRelativePath),
  },
  pnpm: {
    lockfiles: [{ name: "pnpm-lock.yaml" }],
    resolve: (rawLockfile, request) =>
      resolvePnpmLockVersion(rawLockfile, request.name, request.projectRelativePath),
  },
  yarn: {
    lockfiles: [{ name: "yarn.lock" }],
    resolve: (rawLockfile, request) =>
      resolveYarnLockVersion(rawLockfile, request.name, request.specifier),
  },
}

const getLockfiles = (
  managerName: PackageManagerName,
  detectedLockfile: string | readonly string[] | undefined
) => {
  const strategy = packageManagerLockfileStrategies[managerName]
  const lockfileNames =
    detectedLockfile === undefined
      ? (strategy?.lockfiles.map((lockfile) => lockfile.name) ?? [])
      : typeof detectedLockfile === "string"
        ? [detectedLockfile]
        : [...detectedLockfile]

  return lockfileNames.map(
    (name) => strategy?.lockfiles.find((lockfile) => lockfile.name === name) ?? { name }
  )
}

const findNearestLockfiles = Effect.fn("findNearestLockfiles")(function* (
  projectPath: string,
  lockfiles: readonly Lockfile[]
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  let directoryPath = projectPath

  while (directoryPath.length > 0) {
    const matches: Array<Lockfile & { readonly path: string }> = []

    for (const lockfile of lockfiles) {
      const lockfilePath = path.join(directoryPath, lockfile.name)
      const exists = yield* fs.exists(lockfilePath).pipe(
        Effect.mapError(
          (cause) =>
            new ManifestResolutionError({
              cause,
              path: lockfilePath,
            })
        )
      )

      if (exists) {
        matches.push({
          ...lockfile,
          path: lockfilePath,
        })
      }
    }

    if (matches.length > 0) {
      return {
        directoryPath,
        lockfiles: matches,
      }
    }

    const parentPath = path.dirname(directoryPath)

    if (parentPath === directoryPath) {
      return void 0
    }

    directoryPath = parentPath
  }

  return void 0
})

export class PackageManagerResolver extends Context.Service<
  PackageManagerResolver,
  PackageManagerResolverService
>()("PackageManagerResolver") {
  static readonly layer = Layer.succeed(this)({
    resolveLockedVersions: Effect.fn("PackageManagerResolver.resolveLockedVersions")(
      function* (projectPath, dependencies) {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const manager = yield* Effect.tryPromise({
          catch: (cause) =>
            new ManifestResolutionError({
              cause,
              path: projectPath,
            }),
          try: () =>
            detectPackageManager(projectPath, {
              ignoreArgv: true,
              includeParentDirs: true,
            }),
        })

        if (manager === undefined) {
          return new Map<string, string>()
        }

        const strategy = packageManagerLockfileStrategies[manager.name]
        const locatedLockfiles = yield* findNearestLockfiles(
          projectPath,
          getLockfiles(manager.name, manager.lockFile)
        )

        if (strategy === undefined || locatedLockfiles === undefined) {
          return new Map<string, string>()
        }

        const rawProjectRelativePath = path.relative(locatedLockfiles.directoryPath, projectPath)
        const projectRelativePath =
          rawProjectRelativePath.length === 0
            ? "."
            : rawProjectRelativePath.split(path.sep).join("/")
        const unresolved = new Set(dependencies.map((dependency) => dependency.name))
        const versions = new Map<string, string>()

        for (const lockfile of locatedLockfiles.lockfiles) {
          if (lockfile.isText === false) {
            continue
          }

          const rawLockfile = yield* fs.readFileString(lockfile.path).pipe(
            Effect.mapError(
              (cause) =>
                new ManifestResolutionError({
                  cause,
                  path: lockfile.path,
                })
            )
          )

          for (const dependency of dependencies) {
            if (!unresolved.has(dependency.name)) {
              continue
            }

            const resolvedVersion = strategy.resolve(rawLockfile, {
              ...dependency,
              projectRelativePath,
            })

            if (resolvedVersion !== undefined && valid(resolvedVersion) !== null) {
              versions.set(dependency.name, resolvedVersion)
              unresolved.delete(dependency.name)
            }
          }

          if (unresolved.size === 0) {
            break
          }
        }

        return versions
      }
    ),
  })
}

const readNodeModulesVersion = Effect.fn("readNodeModulesVersion")(function* (
  projectPath: string,
  packageName: string
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  let directoryPath = projectPath

  while (directoryPath.length > 0) {
    const packageJsonPath = path.join(directoryPath, "node_modules", packageName, "package.json")
    const rawPackageJson = yield* fs.readFileString(packageJsonPath).pipe(
      Effect.catchFilter(Filter.reason("PlatformError", "NotFound"), () => Effect.succeed(void 0)),
      Effect.mapError(
        (cause) =>
          new ManifestParseError({
            cause,
            path: packageJsonPath,
          })
      )
    )

    if (rawPackageJson !== undefined) {
      const manifest = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(InstalledPackageSchema)
      )(rawPackageJson).pipe(
        Effect.mapError(
          (cause) =>
            new ManifestParseError({
              cause,
              path: packageJsonPath,
            })
        )
      )

      if (valid(manifest.version) !== null) {
        return manifest.version
      }
    }

    const parentPath = path.dirname(directoryPath)

    if (parentPath === directoryPath) {
      return void 0
    }

    directoryPath = parentPath
  }

  return void 0
})

export const readJavascriptManifest = Effect.fn("readJavascriptManifest")(function* (
  projectPath: string
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const packageManagerResolver = yield* PackageManagerResolver
  const manifestPath = path.join(projectPath, "package.json")
  const rawManifest = yield* fs.readFileString(manifestPath)
  const manifest = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(JavascriptPackageManifestSchema)
  )(rawManifest).pipe(
    Effect.mapError(
      (cause) =>
        new ManifestParseError({
          cause,
          path: manifestPath,
        })
    )
  )
  const dependencies = new Map<string, Omit<ManifestDependency, "exactVersion">>()

  for (const group of DEPENDENCY_GROUPS) {
    const entries = manifest[group]

    if (entries === undefined) {
      continue
    }

    for (const [name, specifier] of Object.entries(entries)) {
      if (!dependencies.has(name)) {
        dependencies.set(name, {
          group,
          name,
          registry: "npm",
          specifier,
        })
      }
    }
  }

  const lockedVersions = yield* packageManagerResolver.resolveLockedVersions(projectPath, [
    ...dependencies.values(),
  ])
  const resolvedDependencies: ManifestDependency[] = []

  for (const dependency of dependencies.values()) {
    const lockedVersion = lockedVersions.get(dependency.name)
    const exactVersion =
      lockedVersion ?? (yield* readNodeModulesVersion(projectPath, dependency.name))

    resolvedDependencies.push(
      exactVersion === undefined
        ? dependency
        : {
            ...dependency,
            exactVersion,
          }
    )
  }

  return resolvedDependencies
})

export default defineManifest({
  detect: Effect.fn("javascriptManifest.detect")(function* (projectPath) {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    return yield* fs.exists(path.join(projectPath, "package.json"))
  }),
  name: "javascript",
  read: readJavascriptManifest,
})
