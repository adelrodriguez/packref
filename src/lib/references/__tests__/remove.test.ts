import { afterEach, describe, expect, it } from "bun:test"
import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import {
  PackageNotReferencedError,
  PackageReferenceFilesystemError,
  RemovePackageReferencesError,
} from "#lib/core/errors.ts"
import { findPackageReferenceMatches, removePackageReferences } from "#lib/references/remove.ts"
import { type Lockfile, type PackageEntry, readProjectLockfile } from "#lib/workspace/lockfile.ts"

const temporaryPaths: string[] = []

const makeTempDirectory = async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "packref-remove-reference-test-"))
  temporaryPaths.push(directoryPath)
  return directoryPath
}

const exists = (path: string) =>
  access(path)
    .then(() => true)
    .catch(() => false)

const makeEntry = (version: string, name = "react") =>
  ({
    name,
    registry: "npm",
    source: {
      host: "github.com",
      type: "repository",
      url: "https://github.com/facebook/react",
    },
    tracking: "manual",
    version,
  }) satisfies PackageEntry

const initializeProject = async (projectPath: string, packages: readonly PackageEntry[]) => {
  const directoryPath = join(projectPath, ".packref")
  await mkdir(directoryPath, { recursive: true })
  await writeFile(
    join(directoryPath, "packref-lock.json"),
    `${JSON.stringify({ packages } satisfies Lockfile, null, 2)}\n`
  )
}

const materializeReference = async (projectPath: string, entry: PackageEntry) => {
  const referencePath = join(
    projectPath,
    ".packref",
    "packages",
    entry.registry,
    entry.name,
    entry.version
  )
  await mkdir(referencePath, { recursive: true })
  await writeFile(join(referencePath, "SOURCE.md"), "source")
  return referencePath
}

const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)))

const readLockfile = (projectPath: string) => run(readProjectLockfile(projectPath))

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { force: true, recursive: true }))
  )
})

describe("remove package references", () => {
  it("finds matches in deterministic version order and removes selected entries", async () => {
    const projectPath = await makeTempDirectory()
    const react18 = makeEntry("18.3.1")
    const react19 = makeEntry("19.0.0")
    await initializeProject(projectPath, [react19, react18])
    const react18Path = await materializeReference(projectPath, react18)
    const react19Path = await materializeReference(projectPath, react19)

    const match = await run(
      findPackageReferenceMatches(
        { _tag: "registry", name: "react", registry: "npm" },
        { projectPath }
      )
    )
    const selectedEntries = match.entries.filter((entry) => entry.version === "19.0.0")
    const result = await run(removePackageReferences(match.projectPath, selectedEntries))

    expect(match.entries.map((entry) => entry.version)).toEqual(["18.3.1", "19.0.0"])
    expect(result.missingEntries).toEqual([])
    expect(await exists(react18Path)).toBe(true)
    expect(await exists(react19Path)).toBe(false)
    const lockfile = await readLockfile(projectPath)
    expect(lockfile.packages).toEqual([react18])
  })

  it("finds a SHA-pinned repository entry by its requested tag", async () => {
    const projectPath = await makeTempDirectory()
    const entry = {
      name: "owner/repo",
      registry: "github",
      source: {
        host: "github.com",
        requestedRef: "v1.0.0",
        type: "repository",
        url: "https://github.com/owner/repo",
      },
      tracking: "manual",
      version: "abcdef1234567890abcdef1234567890abcdef12",
    } satisfies PackageEntry
    await initializeProject(projectPath, [entry])

    const match = await run(
      findPackageReferenceMatches(
        {
          _tag: "repository",
          name: "owner/repo",
          registry: "github",
          repository: { url: "owner/repo" },
          specifier: "v1.0.0",
        },
        { projectPath }
      )
    )

    expect(match.entries).toEqual([entry])
  })

  it("reports a missing directory while still removing its lockfile entry", async () => {
    const projectPath = await makeTempDirectory()
    const entry = makeEntry("19.0.0")
    await initializeProject(projectPath, [entry])
    const match = await run(
      findPackageReferenceMatches(
        { _tag: "registry", name: "react", registry: "npm", specifier: "19.0.0" },
        { projectPath }
      )
    )

    const result = await run(removePackageReferences(match.projectPath, match.entries))

    expect(result.missingEntries).toEqual([entry])
    const lockfile = await readLockfile(projectPath)
    expect(lockfile.packages).toEqual([])
  })

  it("keeps failed removals in the lockfile and reports every failed identity", async () => {
    const projectPath = await makeTempDirectory()
    const firstFailure = makeEntry("1.0.0", "first-failure")
    const removed = makeEntry("1.0.0", "removed")
    const secondFailure = makeEntry("1.0.0", "second-failure")
    const entries = [firstFailure, removed, secondFailure]
    await initializeProject(projectPath, entries)
    const firstFailurePath = await materializeReference(projectPath, firstFailure)
    const removedPath = await materializeReference(projectPath, removed)
    const secondFailurePath = await materializeReference(projectPath, secondFailure)
    const firstFailureParent = join(firstFailurePath, "..")
    const secondFailureParent = join(secondFailurePath, "..")
    await chmod(firstFailureParent, 0o555)
    await chmod(secondFailureParent, 0o555)

    let failure: unknown

    try {
      await run(removePackageReferences(projectPath, entries))
    } catch (error) {
      failure = error
    } finally {
      await chmod(firstFailureParent, 0o755)
      await chmod(secondFailureParent, 0o755)
    }

    expect(failure).toBeInstanceOf(RemovePackageReferencesError)
    expect(failure).toMatchObject({
      failures: [
        { cause: expect.any(PackageReferenceFilesystemError), identity: firstFailure },
        { cause: expect.any(PackageReferenceFilesystemError), identity: secondFailure },
      ],
    })
    expect(await exists(firstFailurePath)).toBe(true)
    expect(await exists(removedPath)).toBe(false)
    expect(await exists(secondFailurePath)).toBe(true)
    const lockfile = await readLockfile(projectPath)
    expect(lockfile.packages).toEqual([firstFailure, secondFailure])
  })

  it("fails with a typed error when no reference matches", async () => {
    const projectPath = await makeTempDirectory()
    await initializeProject(projectPath, [])

    try {
      await run(
        findPackageReferenceMatches(
          { _tag: "registry", name: "react", registry: "npm" },
          { projectPath }
        )
      )
      throw new Error("Expected reference lookup to fail.")
    } catch (error) {
      expect(error).toBeInstanceOf(PackageNotReferencedError)
    }
  })
})
