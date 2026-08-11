import { afterEach, describe, expect, it } from "bun:test"
import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import {
  getStoreEntryPath,
  hasStoreEntry,
  listStoreEntries,
  removeStoreEntry,
} from "#lib/store/index.ts"
import { PackrefHome } from "#lib/workspace/home.ts"

const temporaryPaths: string[] = []

const makeTempDirectory = async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "packref-store-test-"))
  temporaryPaths.push(directoryPath)
  return directoryPath
}

const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>, home: string) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, PackrefHome.at(home))))
  )

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

describe("store", () => {
  it("checks, lists, and removes scoped and unscoped entries", async () => {
    const home = await makeTempDirectory()
    const react = {
      name: "react",
      registry: "npm",
      version: "19.0.0",
    }
    const effectCli = {
      name: "@effect/cli",
      registry: "npm",
      version: "0.70.0",
    }
    const repository = {
      name: "owner/repo",
      registry: "github",
      version: "abcdef1234567890abcdef1234567890abcdef12",
    }
    const reactPath = await run(getStoreEntryPath(react), home)
    const effectCliPath = await run(getStoreEntryPath(effectCli), home)
    const repositoryPath = await run(getStoreEntryPath(repository), home)

    await mkdir(reactPath, { recursive: true })
    await mkdir(effectCliPath, { recursive: true })
    await mkdir(repositoryPath, { recursive: true })

    expect(await run(hasStoreEntry(react), home)).toBe(true)
    const initialEntries = await run(listStoreEntries(), home)
    expect(initialEntries.map((entry) => entry.identity)).toEqual([repository, effectCli, react])

    await run(removeStoreEntry(react), home)

    expect(await run(hasStoreEntry(react), home)).toBe(false)
    const remainingEntries = await run(listStoreEntries(), home)
    expect(remainingEntries.map((entry) => entry.identity)).toEqual([repository, effectCli])
  })

  it("returns an empty list when the global store does not exist", async () => {
    const home = await makeTempDirectory()

    expect(await run(listStoreEntries(), home)).toEqual([])
  })
})
