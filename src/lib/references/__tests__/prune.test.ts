import { afterEach, describe, expect, it } from "bun:test"
import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { PackageIdentity } from "#lib/core/packages.ts"
import { initializeProject, repositoryEntry } from "#commands/__tests__/helpers.ts"
import { applyPrunePlan, discoverPrunePlan } from "#lib/references/prune.ts"
import { getStoreEntryPath } from "#lib/store/index.ts"
import { PackrefHome } from "#lib/workspace/home.ts"

const temporaryPaths: string[] = []

const makeTempDirectory = async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "packref-prune-test-"))
  temporaryPaths.push(directoryPath)
  return directoryPath
}

const run = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
  homePath: string
) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, PackrefHome.at(homePath))))
  )

const writeGlobalConfig = async (homePath: string, projects: readonly string[]) => {
  const globalDirectoryPath = join(homePath, ".agents", "packref")
  await mkdir(globalDirectoryPath, { recursive: true })
  await writeFile(
    join(globalDirectoryPath, "config.json"),
    `${JSON.stringify({ projects }, null, 2)}\n`
  )
}

const materializeStoreEntry = async (homePath: string, identity: PackageIdentity) => {
  const entryPath = await run(getStoreEntryPath(identity), homePath)
  await mkdir(entryPath, { recursive: true })
  await writeFile(join(entryPath, "SOURCE.md"), "source")
  return entryPath
}

const exists = (path: string) =>
  access(path)
    .then(() => true)
    .catch(() => false)

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

describe("prune", () => {
  it("deletes unused entries while retaining an entry shared by registered projects", async () => {
    const homePath = await makeTempDirectory()
    const firstProjectPath = await makeTempDirectory()
    const secondProjectPath = await makeTempDirectory()
    const shared = repositoryEntry("react", "19.0.0")
    const unused = repositoryEntry("zod", "4.0.0")
    await initializeProject(firstProjectPath, [shared])
    await initializeProject(secondProjectPath, [shared])
    await writeGlobalConfig(homePath, [firstProjectPath, secondProjectPath])
    const sharedPath = await materializeStoreEntry(homePath, shared)
    const unusedPath = await materializeStoreEntry(homePath, unused)

    const plan = await run(discoverPrunePlan(), homePath)
    const result = await run(applyPrunePlan(plan, false), homePath)

    expect(plan.storeEntries.map((entry) => entry.identity)).toEqual([
      { name: "zod", registry: "npm", version: "4.0.0" },
    ])
    expect(result.removedEntries).toEqual(plan.storeEntries)
    expect(await exists(sharedPath)).toBe(true)
    expect(await exists(unusedPath)).toBe(false)
  })

  it("returns an empty plan for an empty store", async () => {
    const homePath = await makeTempDirectory()
    await writeGlobalConfig(homePath, [])

    const plan = await run(discoverPrunePlan(), homePath)
    const result = await run(applyPrunePlan(plan, false), homePath)

    expect(plan.storeEntries).toEqual([])
    expect(result.removedEntries).toEqual([])
  })

  it("reports missing and malformed lockfiles without crashing", async () => {
    const homePath = await makeTempDirectory()
    const missingLockfileProjectPath = await makeTempDirectory()
    const malformedLockfileProjectPath = await makeTempDirectory()
    await mkdir(join(malformedLockfileProjectPath, ".packref"), { recursive: true })
    await writeFile(join(malformedLockfileProjectPath, ".packref", "packref-lock.json"), "{")
    await writeGlobalConfig(homePath, [malformedLockfileProjectPath, missingLockfileProjectPath])

    const plan = await run(discoverPrunePlan(), homePath)

    expect(plan.warnings).toHaveLength(2)
    expect(plan.warnings).toContainEqual({
      projectPath: malformedLockfileProjectPath,
      type: "malformed-lockfile",
    })
    expect(plan.warnings).toContainEqual({
      projectPath: missingLockfileProjectPath,
      type: "missing-lockfile",
    })
  })

  it("preserves store entries when a registered project lockfile is unreadable", async () => {
    const homePath = await makeTempDirectory()
    const missingLockfileProjectPath = await makeTempDirectory()
    const unused = repositoryEntry("zod", "4.0.0")
    await writeGlobalConfig(homePath, [missingLockfileProjectPath])
    const unusedPath = await materializeStoreEntry(homePath, unused)

    const plan = await run(discoverPrunePlan(), homePath)
    const result = await run(
      applyPrunePlan(
        {
          ...plan,
          storeEntries: [{ identity: unused, path: unusedPath }],
        },
        false
      ),
      homePath
    )

    expect(plan.storeEntries).toEqual([])
    expect(result.removedEntries).toEqual([])
    expect(await exists(unusedPath)).toBe(true)
  })

  it("preserves store entries when a registered project lockfile is malformed", async () => {
    const homePath = await makeTempDirectory()
    const malformedLockfileProjectPath = await makeTempDirectory()
    const unused = repositoryEntry("zod", "4.0.0")
    await mkdir(join(malformedLockfileProjectPath, ".packref"), { recursive: true })
    await writeFile(join(malformedLockfileProjectPath, ".packref", "packref-lock.json"), "{")
    await writeGlobalConfig(homePath, [malformedLockfileProjectPath])
    const unusedPath = await materializeStoreEntry(homePath, unused)

    const plan = await run(discoverPrunePlan(), homePath)
    const result = await run(applyPrunePlan(plan, false), homePath)

    expect(plan.storeEntries).toEqual([])
    expect(result.removedEntries).toEqual([])
    expect(await exists(unusedPath)).toBe(true)
  })

  it("preserves store entries while stale projects remain registered", async () => {
    const homePath = await makeTempDirectory()
    const staleProjectPath = join(homePath, "missing-project")
    const unused = repositoryEntry("zod", "4.0.0")
    await writeGlobalConfig(homePath, [staleProjectPath])
    const unusedPath = await materializeStoreEntry(homePath, unused)

    const plan = await run(discoverPrunePlan(), homePath)
    const result = await run(
      applyPrunePlan(
        {
          ...plan,
          storeEntries: [{ identity: unused, path: unusedPath }],
        },
        false
      ),
      homePath
    )

    expect(plan.staleProjectPaths).toEqual([staleProjectPath])
    expect(plan.storeEntries).toEqual([])
    expect(result.removedEntries).toEqual([])
    expect(await exists(unusedPath)).toBe(true)
  })

  it("only removes stale registrations when approved", async () => {
    const homePath = await makeTempDirectory()
    const existingProjectPath = await makeTempDirectory()
    const staleProjectPath = join(homePath, "missing-project")
    await initializeProject(existingProjectPath, [])
    await writeGlobalConfig(homePath, [existingProjectPath, staleProjectPath])

    const plan = await run(discoverPrunePlan(), homePath)
    await run(applyPrunePlan(plan, false), homePath)
    const configPath = join(homePath, ".agents", "packref", "config.json")
    const retainedConfig = JSON.parse(await readFile(configPath, "utf8"))

    expect(plan.staleProjectPaths).toEqual([staleProjectPath])
    expect(retainedConfig.projects).toEqual([existingProjectPath, staleProjectPath])

    const result = await run(applyPrunePlan(plan, true), homePath)
    const updatedConfig = JSON.parse(await readFile(configPath, "utf8"))

    expect(result.removedProjectPaths).toEqual([staleProjectPath])
    expect(updatedConfig.projects).toEqual([existingProjectPath])
  })
})
