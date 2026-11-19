import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { afterEach, describe, expect, it } from "vitest"
import { ManifestResolutionError } from "#lib/core/errors.ts"
import { PackageManagerDetector } from "#lib/manifests/package-manager-detector.ts"

const temporaryPaths: string[] = []

const makeProject = async (files: Record<string, string>) => {
  const root = await mkdtemp(join(tmpdir(), "packref-package-manager-detector-test-"))
  temporaryPaths.push(root)

  await Promise.all(
    Object.entries(files).map(async ([file, content]) => {
      await mkdir(join(root, file, ".."), { recursive: true })
      await writeFile(join(root, file), content)
    })
  )

  return root
}

const detect = (projectPath: string) =>
  Effect.runPromise(
    Effect.flatMap(PackageManagerDetector, (detector) => detector.detect(projectPath)).pipe(
      Effect.provide(PackageManagerDetector.layer.pipe(Layer.provide(NodeServices.layer)))
    )
  )

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true }))
  )
})

describe("PackageManagerDetector", () => {
  it.each<{ readonly expected: string; readonly files: Record<string, string> }>([
    { expected: "pnpm", files: { "package.json": '{ "packageManager": "pnpm@10.0.0+sha512.a" }' } },
    {
      expected: "bun",
      files: { "package.json": '{ "devEngines": { "packageManager": { "name": "bun" } } }' },
    },
    {
      expected: "yarn",
      files: { "package.json": '{ "devEngines": { "packageManager": [{ "name": "yarn" }] } }' },
    },
    { expected: "npm", files: { "package.json": "{}", "package-lock.json": "{}" } },
    { expected: "pnpm", files: { "pnpm-workspace.yaml": "" } },
    { expected: "bun", files: { "bun.lock": "{}" } },
    { expected: "yarn", files: { ".yarnrc.yml": "" } },
    { expected: "deno", files: { "deno.json": "{}", "package-lock.json": "{}" } },
    {
      expected: "pnpm",
      files: { "package.json": '{ "packageManager": "pnpm@10.0.0" }', "package-lock.json": "{}" },
    },
    { expected: "npm", files: { "package-lock.json": "{}", "yarn.lock": "" } },
  ])("detects $expected from $files", async ({ expected, files }) => {
    expect(await detect(await makeProject(files))).toEqual(Option.some(expected))
  })

  it("searches the folders above the project", async () => {
    const root = await makeProject({
      "packages/app/package.json": "{}",
      "pnpm-lock.yaml": "",
    })

    expect(await detect(join(root, "packages", "app"))).toEqual(Option.some("pnpm"))
  })

  it("stops at a package.json that names a package manager it does not recognize", async () => {
    const root = await makeProject({
      "packages/app/package.json": '{ "packageManager": "cnpm@9.0.0" }',
      "pnpm-lock.yaml": "",
    })

    expect(await detect(join(root, "packages", "app"))).toEqual(Option.none())
  })

  it("fails for a malformed package.json", async () => {
    const root = await makeProject({ "package.json": "{" })

    await expect(detect(root)).rejects.toBeInstanceOf(ManifestResolutionError)
  })
})
