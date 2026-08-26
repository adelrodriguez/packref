import { afterEach, describe, expect, it, spyOn } from "bun:test"
import { execFile } from "node:child_process"
import { constants } from "node:fs"
import * as fsPromises from "node:fs/promises"
import { copyFile, mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import * as Effect from "effect/Effect"
import { ReflinkError } from "#lib/core/errors.ts"
import { Reflinker } from "#lib/workspace/reflinker.ts"

const execFileAsync = promisify(execFile)
const temporaryPaths: string[] = []

const reflinkRootOverride = process.env["PACKREF_REFLINK_TEST_DIR"]
const reflinkRoot = reflinkRootOverride ?? tmpdir()

const makeTempDirectory = async (root = tmpdir()) => {
  const directoryPath = await mkdtemp(join(root, "packref-reflinker-test-"))
  temporaryPaths.push(directoryPath)
  return directoryPath
}

const reflink = (source: string, target: string) =>
  Effect.gen(function* () {
    const reflinker = yield* Reflinker
    yield* reflinker.reflink(source, target)
  })

const run = <A, E>(effect: Effect.Effect<A, E, Reflinker>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Reflinker.layer)))

// COPYFILE_FICLONE_FORCE fails instead of falling back to a plain copy, so a
// successful probe proves the filesystem clones. The best-effort FICLONE mode
// used by Reflinker issues the same clone request before falling back, so on a
// filesystem that passes this probe a reflink is guaranteed to have happened.
const supportsReflink = async (root: string) => {
  const probeDirectory = await mkdtemp(join(root, "packref-reflink-probe-"))
  const source = join(probeDirectory, "source")
  const target = join(probeDirectory, "target")
  try {
    await writeFile(source, "probe")
    await copyFile(source, target, constants.COPYFILE_FICLONE_FORCE)
    return true
  } catch {
    return false
  } finally {
    await rm(probeDirectory, { force: true, recursive: true })
  }
}

const flushToDisk = async (filePath: string) => {
  const handle = await open(filePath, "r+")
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

const readPhysicalExtents = async (filePath: string) => {
  const { stdout } = await execFileAsync("filefrag", ["-v", filePath])
  return [...stdout.matchAll(/^\s*\d+:\s*\d+\.\.\s*\d+:\s*(\d+)\.\./gm)].map((match) =>
    Number(match[1])
  )
}

const reflinkSupported = await supportsReflink(reflinkRoot)
const hasFilefrag = await execFileAsync("filefrag", ["-V"]).then(
  () => true,
  () => false
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

describe("Reflinker", () => {
  it("requests a copy-on-write clone from the filesystem", async () => {
    const directoryPath = await makeTempDirectory()
    const source = join(directoryPath, "source")
    const target = join(directoryPath, "target")
    await mkdir(source)
    await writeFile(join(source, "index.ts"), "export {}")
    const cpSpy = spyOn(fsPromises, "cp")

    try {
      await run(reflink(source, target))

      expect(cpSpy).toHaveBeenCalledTimes(1)
      expect(cpSpy).toHaveBeenCalledWith(source, target, {
        errorOnExist: true,
        force: false,
        mode: constants.COPYFILE_FICLONE,
        recursive: true,
      })
    } finally {
      cpSpy.mockRestore()
    }

    expect(await readFile(join(target, "index.ts"), "utf8")).toBe("export {}")
  })

  it("fails with ReflinkError instead of overwriting an existing target", async () => {
    const directoryPath = await makeTempDirectory()
    const source = join(directoryPath, "source.txt")
    const target = join(directoryPath, "target.txt")
    await writeFile(source, "fresh")
    await writeFile(target, "occupied")

    const failure = await run(Effect.flip(reflink(source, target)))

    expect(failure).toBeInstanceOf(ReflinkError)
    expect(await readFile(target, "utf8")).toBe("occupied")
  })

  it.if(reflinkRootOverride !== undefined)(
    "dedicated reflink filesystem supports cloning",
    () => {
      expect(reflinkSupported).toBe(true)
      if (process.platform === "linux") {
        expect(hasFilefrag).toBe(true)
      }
    }
  )

  it.skipIf(!reflinkSupported)("clones the source instead of copying it", async () => {
    const directoryPath = await makeTempDirectory(reflinkRoot)
    const source = join(directoryPath, "source")
    const target = join(directoryPath, "target")
    await mkdir(source)
    // Large enough that Btrfs stores real data extents instead of inlining
    // the payload into metadata, which would make extent comparison moot.
    const payload = Buffer.alloc(1 << 20, "packref-reflink-test\n")
    const sourceFile = join(source, "payload.bin")
    await writeFile(sourceFile, payload)
    await flushToDisk(sourceFile)

    await run(reflink(source, target))

    const targetFile = join(target, "payload.bin")
    const copied = await readFile(targetFile)
    expect(copied.equals(payload)).toBe(true)

    if (process.platform === "linux" && hasFilefrag) {
      await flushToDisk(targetFile)
      const sourceExtents = await readPhysicalExtents(sourceFile)
      const targetExtents = await readPhysicalExtents(targetFile)
      expect(sourceExtents.length).toBeGreaterThan(0)
      expect(targetExtents).toEqual(sourceExtents)
    }
  })
})
