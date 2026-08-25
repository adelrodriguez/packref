import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { afterEach, describe, expect, it } from "vitest"
import { ProjectDependencyReader } from "#lib/manifests/index.ts"
import {
  PackageManagerResolver,
  readJavascriptManifest,
  resolveBunLockVersion,
  resolveNpmLockVersion,
  resolvePnpmLockVersion,
  resolveYarnLockVersion,
} from "#lib/manifests/javascript.ts"
import { PackageManagerDetector } from "#lib/manifests/package-manager-detector.ts"

const temporaryPaths: string[] = []
const PackageManagerTestLayer = PackageManagerResolver.layer.pipe(
  Layer.provide(PackageManagerDetector.layer),
  Layer.provide(NodeServices.layer)
)
const ManifestTestLayer = Layer.mergeAll(
  NodeServices.layer,
  PackageManagerTestLayer,
  ProjectDependencyReader.layer.pipe(
    Layer.provide(Layer.merge(NodeServices.layer, PackageManagerTestLayer))
  )
)

const readProjectDependencies = Effect.fn("test.readProjectDependencies")(function* (
  projectPath: string
) {
  const reader = yield* ProjectDependencyReader

  return yield* reader.readProjectDependencies(projectPath)
})

const makeTempDirectory = async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "packref-manifest-test-"))
  temporaryPaths.push(directoryPath)
  return directoryPath
}

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | PackageManagerResolver | Path.Path | ProjectDependencyReader
  >
) => Effect.runPromise(effect.pipe(Effect.provide(ManifestTestLayer)))

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((directoryPath) =>
      rm(directoryPath, {
        force: true,
        recursive: true,
      })
    )
  )
})

describe("JavaScript manifest lockfile parsers", () => {
  it("resolves direct dependencies from Bun lockfiles", () => {
    expect(
      resolveBunLockVersion(
        `
{
  "packages": {
    "effect": ["effect@4.0.0-beta.56", "", {}]
  }
}
`,
        "effect"
      )
    ).toEqual(Option.some("4.0.0-beta.56"))
  })

  it("resolves scoped dependencies from Bun lockfiles", () => {
    expect(
      resolveBunLockVersion(
        `
{
  "packages": {
    "@scope/name": ["@scope/name@1.2.3", "", {}]
  }
}
`,
        "@scope/name"
      )
    ).toEqual(Option.some("1.2.3"))
  })

  it("resolves direct dependencies from npm lockfiles", () => {
    expect(
      resolveNpmLockVersion(
        JSON.stringify({
          packages: {
            "node_modules/react": {
              version: "19.0.0",
            },
          },
        }),
        "react"
      )
    ).toEqual(Option.some("19.0.0"))
  })

  it("resolves scoped dependencies from npm lockfiles", () => {
    expect(
      resolveNpmLockVersion(
        JSON.stringify({
          packages: {
            "node_modules/@scope/name": {
              version: "1.2.3",
            },
          },
        }),
        "@scope/name"
      )
    ).toEqual(Option.some("1.2.3"))
  })

  it("resolves direct dependencies from pnpm lockfiles", () => {
    expect(
      resolvePnpmLockVersion(
        `
importers:
  .:
    dependencies:
      react:
        specifier: ^19.0.0
        version: 19.1.0
`,
        "react"
      )
    ).toEqual(Option.some("19.1.0"))
  })

  it("resolves scoped dependencies with peer suffixes from pnpm lockfiles", () => {
    expect(
      resolvePnpmLockVersion(
        `
importers:
  .:
    dependencies:
      "@scope/name":
        specifier: ^1.0.0
        version: 1.2.3(react@19.0.0)
packages:
  "@scope/name@1.2.3(react@19.0.0)":
    resolution: {integrity: sha512-example}
`,
        "@scope/name"
      )
    ).toEqual(Option.some("1.2.3"))
  })

  it("resolves dependencies from the requested pnpm workspace importer", () => {
    const lockfile = `
importers:
  .:
    dependencies:
      react:
        specifier: ^19.0.0
        version: 19.1.0
  packages/app:
    dependencies:
      react:
        specifier: ^18.0.0
        version: 18.3.1
`

    expect(resolvePnpmLockVersion(lockfile, "react", "packages/app")).toEqual(Option.some("18.3.1"))
  })

  it("resolves scalar dependencies from legacy pnpm lockfiles", () => {
    expect(
      resolvePnpmLockVersion(
        `
lockfileVersion: 5.4
specifiers:
  react: ^18.0.0
dependencies:
  react: 18.3.1
`,
        "react"
      )
    ).toEqual(Option.some("18.3.1"))
  })

  it("resolves direct dependencies from Yarn lockfiles", () => {
    expect(
      resolveYarnLockVersion(
        `
"react@^19.0.0":
  version "19.1.0"
  resolved "https://registry.yarnpkg.com/react/-/react-19.1.0.tgz"
`,
        "react",
        "^19.0.0"
      )
    ).toEqual(Option.some("19.1.0"))
  })

  it("resolves scoped dependencies from Yarn classic and Berry lockfiles", () => {
    const classicLockfile = `
"@scope/name@^1.0.0":
  version "1.2.3"
  resolved "https://registry.yarnpkg.com/@scope/name/-/name-1.2.3.tgz"
`
    const berryLockfile = `
"@scope/name@npm:^1.0.0":
  version: 1.2.4
  resolution: "@scope/name@npm:1.2.4"
`

    expect(resolveYarnLockVersion(classicLockfile, "@scope/name", "^1.0.0")).toEqual(
      Option.some("1.2.3")
    )
    expect(resolveYarnLockVersion(berryLockfile, "@scope/name", "^1.0.0")).toEqual(
      Option.some("1.2.4")
    )
  })

  it("does not match a selector embedded in a scoped Yarn package name", () => {
    expect(
      resolveYarnLockVersion(
        `
"@scope/name@^1.0.0":
  version "1.2.3"
"name@^1.0.0":
  version "2.3.4"
`,
        "name",
        "^1.0.0"
      )
    ).toEqual(Option.some("2.3.4"))
  })
})

describe("readJavascriptManifest", () => {
  it("uses the package manager detector supplied through the Effect environment", async () => {
    const projectPath = await makeTempDirectory()
    await writeFile(
      join(projectPath, "detected-versions.json"),
      JSON.stringify({
        packages: {
          "node_modules/effect": {
            version: "4.0.0-beta.56",
          },
        },
      })
    )
    const detectorLayer = Layer.succeed(PackageManagerDetector)({
      detect: () =>
        Effect.succeed({
          lockFile: "detected-versions.json",
          name: "npm",
        }),
    })
    const resolverLayer = PackageManagerResolver.layer.pipe(
      Layer.provide(detectorLayer),
      Layer.provide(NodeServices.layer)
    )
    const versions = await Effect.runPromise(
      Effect.gen(function* () {
        const resolver = yield* PackageManagerResolver

        return yield* resolver.resolveLockedVersions(projectPath, [
          {
            name: "effect",
            specifier: "^4.0.0",
          },
        ])
      }).pipe(Effect.provide(resolverLayer))
    )

    expect(versions).toEqual(new Map([["effect", "4.0.0-beta.56"]]))
  })

  it("detects package.json and reports all dependency groups", async () => {
    const projectPath = await makeTempDirectory()
    await writeFile(
      join(projectPath, "package.json"),
      JSON.stringify({
        dependencies: { effect: "^4.0.0-beta.50" },
        devDependencies: { typescript: "^7.0.0" },
        peerDependencies: { react: "^19.0.0" },
      })
    )

    const dependencies = Option.getOrThrow(await run(readProjectDependencies(projectPath)))
    expect(
      dependencies.map(({ group, name, specifier }) => ({
        group,
        name,
        specifier,
      }))
    ).toEqual([
      {
        group: "dependencies",
        name: "effect",
        specifier: "^4.0.0-beta.50",
      },
      {
        group: "devDependencies",
        name: "typescript",
        specifier: "^7.0.0",
      },
      {
        group: "peerDependencies",
        name: "react",
        specifier: "^19.0.0",
      },
    ])
  })

  it("prefers the nypm-detected lockfile over node_modules", async () => {
    const projectPath = await makeTempDirectory()
    await writeFile(
      join(projectPath, "package.json"),
      JSON.stringify({
        dependencies: {
          effect: "^4.0.0-beta.50",
        },
        packageManager: "bun@1.3.1",
      })
    )
    await writeFile(
      join(projectPath, "bun.lock"),
      `{
  "lockfileVersion": 1,
  "packages": {
    "effect": ["effect@4.0.0-beta.56", "", {}]
  }
}
`
    )
    await mkdir(join(projectPath, "node_modules", "effect"), { recursive: true })
    await writeFile(
      join(projectPath, "node_modules", "effect", "package.json"),
      JSON.stringify({ version: "4.0.0-beta.55" })
    )

    const dependencies = await run(readJavascriptManifest(projectPath))

    expect(dependencies[0]?.exactVersion).toBe("4.0.0-beta.56")
  })

  it("resolves the exact version from a parent workspace lockfile", async () => {
    const workspaceRoot = await makeTempDirectory()
    const projectPath = join(workspaceRoot, "packages", "app")
    await mkdir(projectPath, { recursive: true })
    await writeFile(
      join(workspaceRoot, "package.json"),
      JSON.stringify({
        packageManager: "pnpm@10.0.0",
        workspaces: ["packages/*"],
      })
    )
    await writeFile(
      join(projectPath, "package.json"),
      JSON.stringify({
        dependencies: {
          react: "^18.0.0",
        },
      })
    )
    await writeFile(
      join(workspaceRoot, "pnpm-lock.yaml"),
      `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      react:
        specifier: ^19.0.0
        version: 19.1.0
  packages/app:
    dependencies:
      react:
        specifier: ^18.0.0
        version: 18.3.1
`
    )

    const dependencies = await run(readJavascriptManifest(projectPath))

    expect(dependencies[0]?.exactVersion).toBe("18.3.1")
  })

  it("finds hoisted node_modules versions after skipping a parent binary Bun lockfile", async () => {
    const workspaceRoot = await makeTempDirectory()
    const projectPath = join(workspaceRoot, "packages", "app")
    await mkdir(projectPath, { recursive: true })
    await writeFile(
      join(workspaceRoot, "package.json"),
      JSON.stringify({
        packageManager: "bun@1.3.1",
        workspaces: ["packages/*"],
      })
    )
    await writeFile(
      join(projectPath, "package.json"),
      JSON.stringify({
        dependencies: {
          effect: "^4.0.0-beta.50",
        },
      })
    )
    await writeFile(join(workspaceRoot, "bun.lockb"), new Uint8Array([0, 255, 1, 254]))
    await mkdir(join(workspaceRoot, "node_modules", "effect"), { recursive: true })
    await writeFile(
      join(workspaceRoot, "node_modules", "effect", "package.json"),
      JSON.stringify({ version: "4.0.0-beta.55" })
    )

    const dependencies = await run(readJavascriptManifest(projectPath))

    expect(dependencies[0]?.exactVersion).toBe("4.0.0-beta.55")
  })

  it("falls back to node_modules when no lockfile resolves the package", async () => {
    const projectPath = await makeTempDirectory()
    await writeFile(
      join(projectPath, "package.json"),
      JSON.stringify({
        dependencies: {
          effect: "^4.0.0-beta.50",
        },
      })
    )
    await mkdir(join(projectPath, "node_modules", "effect"), { recursive: true })
    await writeFile(
      join(projectPath, "node_modules", "effect", "package.json"),
      JSON.stringify({ version: "4.0.0-beta.55" })
    )

    const dependencies = await run(readJavascriptManifest(projectPath))

    expect(dependencies[0]?.exactVersion).toBe("4.0.0-beta.55")
  })

  it("falls back to node_modules when a package is absent from the lockfile", async () => {
    const projectPath = await makeTempDirectory()
    await writeFile(
      join(projectPath, "package.json"),
      JSON.stringify({
        dependencies: {
          effect: "^4.0.0-beta.50",
        },
        packageManager: "bun@1.3.1",
      })
    )
    await writeFile(
      join(projectPath, "bun.lock"),
      `{
  "packages": {
    "react": ["react@19.0.0", "", {}]
  }
}
`
    )
    await mkdir(join(projectPath, "node_modules", "effect"), { recursive: true })
    await writeFile(
      join(projectPath, "node_modules", "effect", "package.json"),
      JSON.stringify({ version: "4.0.0-beta.55" })
    )

    const dependencies = await run(readJavascriptManifest(projectPath))

    expect(dependencies[0]?.exactVersion).toBe("4.0.0-beta.55")
  })

  it("falls back to node_modules when a lockfile is malformed", async () => {
    const projectPath = await makeTempDirectory()
    await writeFile(
      join(projectPath, "package.json"),
      JSON.stringify({
        dependencies: {
          effect: "^4.0.0-beta.50",
        },
        packageManager: "bun@1.3.1",
      })
    )
    await writeFile(join(projectPath, "bun.lock"), "{ not valid JSON")
    await mkdir(join(projectPath, "node_modules", "effect"), { recursive: true })
    await writeFile(
      join(projectPath, "node_modules", "effect", "package.json"),
      JSON.stringify({ version: "4.0.0-beta.55" })
    )

    const dependencies = await run(readJavascriptManifest(projectPath))

    expect(dependencies[0]?.exactVersion).toBe("4.0.0-beta.55")
  })

  it("falls back to node_modules when only Bun's binary lockfile exists", async () => {
    const projectPath = await makeTempDirectory()
    await writeFile(
      join(projectPath, "package.json"),
      JSON.stringify({
        dependencies: {
          effect: "^4.0.0-beta.50",
        },
        packageManager: "bun@1.3.1",
      })
    )
    await writeFile(join(projectPath, "bun.lockb"), new Uint8Array([0, 255, 1, 254]))
    await mkdir(join(projectPath, "node_modules", "effect"), { recursive: true })
    await writeFile(
      join(projectPath, "node_modules", "effect", "package.json"),
      JSON.stringify({ version: "4.0.0-beta.55" })
    )

    const dependencies = await run(readJavascriptManifest(projectPath))

    expect(dependencies[0]?.exactVersion).toBe("4.0.0-beta.55")
  })

  it("reports no dependency for packages absent from the manifest", async () => {
    const projectPath = await makeTempDirectory()
    await writeFile(join(projectPath, "package.json"), JSON.stringify({ dependencies: {} }))

    const dependencies = Option.getOrThrow(await run(readProjectDependencies(projectPath)))

    expect(dependencies.find((dependency) => dependency.name === "react")).toBeUndefined()
  })
})
