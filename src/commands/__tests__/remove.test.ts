import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import type { PackageEntry } from "#lib/core/workspace.ts"
import {
  exists,
  initializeProject,
  makeCommandTestContext,
  materializeReference,
  repositoryEntry,
} from "#commands/__tests__/helpers.ts"
import { readProjectLockfile } from "#lib/workspace/lockfile.ts"

const context = makeCommandTestContext("packref-remove-test-")

const runRemove = (
  projectPath: string,
  homePath: string,
  packageSpec?: string,
  input?: string,
  command: "remove" | "rm" = "remove"
) =>
  context.runCli({
    args: [command, ...(Predicate.isUndefined(packageSpec) ? [] : [packageSpec])],
    homePath,
    input,
    projectPath,
    prompt: Predicate.isUndefined(packageSpec) ? "Select packages" : "Select versions",
  })

const tarballEntry = (
  name: string,
  version: string,
  tracking: PackageEntry["tracking"] = "dependency"
) =>
  ({
    name,
    registry: "npm",
    source: {
      type: "tarball",
      url: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
    },
    tracking,
    version,
  }) satisfies PackageEntry

const readLockfile = (projectPath: string) =>
  Effect.runPromise(readProjectLockfile(projectPath).pipe(Effect.provide(NodeServices.layer)))

afterEach(context.cleanup)

describe("remove", () => {
  it("removes only an exact local version and preserves the global store", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const react18 = repositoryEntry("react", "18.3.1")
    const react19 = repositoryEntry("react", "19.0.0")
    await initializeProject(projectPath, [react18, react19])
    const react18Path = await materializeReference(projectPath, react18)
    const react19Path = await materializeReference(projectPath, react19)
    const storedSourcePath = join(
      homePath,
      ".agents",
      "packref",
      "store",
      "packages",
      "npm",
      "react",
      "18.3.1"
    )
    await mkdir(storedSourcePath, { recursive: true })
    await writeFile(join(storedSourcePath, "SOURCE.md"), "global source")

    const result = await runRemove(projectPath, homePath, "npm:react@18.3.1")

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Removed npm:react@18.3.1")
    expect(await exists(react18Path)).toBe(false)
    expect(await exists(react19Path)).toBe(true)
    expect(await exists(storedSourcePath)).toBe(true)
    const lockfile = await readLockfile(projectPath)
    expect(lockfile.packages).toEqual([react19])
  })

  it("supports rm as an alias", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const entry = repositoryEntry("react", "19.0.0")
    await initializeProject(projectPath, [entry])
    const referencePath = await materializeReference(projectPath, entry)

    const result = await runRemove(projectPath, homePath, "react", undefined, "rm")

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Removed npm:react@19.0.0")
    expect(await exists(referencePath)).toBe(false)
  })

  it("removes a name-only match directly when only one version exists", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const entry = repositoryEntry("@effect/cli", "0.70.0")
    await initializeProject(projectPath, [entry])
    const referencePath = await materializeReference(projectPath, entry)

    const result = await runRemove(projectPath, homePath, "@effect/cli")

    expect(result.exitCode).toBe(0)
    expect(result.output).not.toContain("Select versions")
    expect(await exists(referencePath)).toBe(false)
    const lockfile = await readLockfile(projectPath)
    expect(lockfile.packages).toEqual([])
  })

  it("shows a multiselect when a name matches multiple versions", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const react18 = repositoryEntry("react", "18.3.1")
    const react19 = repositoryEntry("react", "19.0.0")
    await initializeProject(projectPath, [react19, react18])
    const react18Path = await materializeReference(projectPath, react18)
    const react19Path = await materializeReference(projectPath, react19)

    const result = await runRemove(projectPath, homePath, "react", "\u001B[B \r")

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Select versions of npm:react to remove")
    expect(result.output).toContain("github.com (manual)")
    expect(result.output).not.toContain("repository, manual")
    expect(result.output).toContain("Removed 1 package reference")
    expect(await exists(react18Path)).toBe(true)
    expect(await exists(react19Path)).toBe(false)
    const lockfile = await readLockfile(projectPath)
    expect(lockfile.packages).toEqual([react18])
  })

  it("allows selecting no versions when a name matches multiple versions", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const react18 = repositoryEntry("react", "18.3.1")
    const react19 = repositoryEntry("react", "19.0.0")
    await initializeProject(projectPath, [react18, react19])
    const react18Path = await materializeReference(projectPath, react18)
    const react19Path = await materializeReference(projectPath, react19)

    const result = await runRemove(projectPath, homePath, "react", "\r")

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("No package references removed")
    expect(await exists(react18Path)).toBe(true)
    expect(await exists(react19Path)).toBe(true)
    const lockfile = await readLockfile(projectPath)
    expect(lockfile.packages).toEqual([react18, react19])
  })

  it("gracefully handles package selection cancellation", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const entry = repositoryEntry("react", "19.0.0")
    await initializeProject(projectPath, [entry])
    const referencePath = await materializeReference(projectPath, entry)

    const result = await runRemove(projectPath, homePath, undefined, "\u0003")

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("You've cancelled the package removal process.")
    expect(result.output).not.toContain("Operation cancelled")
    expect(result.output).not.toContain("No package references removed")
    expect(await exists(referencePath)).toBe(true)
  })

  it("shows all references in a multiselect when no package is provided", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const react = repositoryEntry("react", "19.0.0", "dependency")
    const zod = tarballEntry("zod", "4.0.0", "manual")
    await initializeProject(projectPath, [zod, react])
    const reactPath = await materializeReference(projectPath, react)
    const zodPath = await materializeReference(projectPath, zod)

    const result = await runRemove(projectPath, homePath, undefined, "\u001B[B \r")

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Select packages to remove")
    expect(result.output).toContain("npm:react@19.0.0")
    expect(result.output).toContain("npm:zod@4.0.0")
    expect(result.output).toContain("github.com")
    expect(result.output).not.toContain("github.com (manual)")
    expect(result.output).toContain("tarball (manual)")
    expect(result.output).not.toContain("repository, dependency")
    expect(result.output).toContain("Removed 1 package reference")
    expect(await exists(reactPath)).toBe(true)
    expect(await exists(zodPath)).toBe(false)
    const lockfile = await readLockfile(projectPath)
    expect(lockfile.packages).toEqual([react])
  })

  it("prints a helpful message when bare remove has no candidates", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    await initializeProject(projectPath, [])

    const result = await runRemove(projectPath, homePath)

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("No packages are currently installed.")
    expect(result.output).toContain("No package references removed")
  })

  it("warns and succeeds when the local directory is already missing", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const entry = tarballEntry("example", "1.0.0")
    await initializeProject(projectPath, [entry])

    const result = await runRemove(projectPath, homePath, "example")

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("was already missing; removed its lockfile entry")
    const lockfile = await readLockfile(projectPath)
    expect(lockfile.packages).toEqual([])
  })

  it("reports a package that is not referenced", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    await initializeProject(projectPath, [])

    const result = await runRemove(projectPath, homePath, "react")

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("Package `npm:react` is not referenced")
  })

  it("reports an uninitialized project", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()

    const result = await runRemove(projectPath, homePath, "react")

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("Run `packref init` first")
  })
})
