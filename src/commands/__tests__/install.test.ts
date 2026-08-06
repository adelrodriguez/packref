import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createTarGzip } from "nanotar"
import type { PackageEntry } from "#lib/workspace/lockfile.ts"
import {
  initializeProject,
  makeCommandTestContext,
  materializeReference,
  repositoryEntry,
} from "#commands/__tests__/helpers.ts"

const context = makeCommandTestContext("packref-install-command-test-")

const tarballEntry = (name: string, version: string, url: string) =>
  ({
    name,
    registry: "npm",
    source: { type: "tarball", url },
    tracking: "manual",
    version,
  }) satisfies PackageEntry

const materializeStoreEntry = async (homePath: string, entry: PackageEntry) => {
  const identitySegments = ["packages", entry.registry, ...entry.name.split("/"), entry.version]
  const entryPath = join(homePath, ".agents", "packref", "store", ...identitySegments)
  const metadataPath = join(
    homePath,
    ".agents",
    "packref",
    "store",
    ".metadata",
    ...identitySegments.slice(0, -1),
    `${entry.version}.json`
  )
  await mkdir(entryPath, { recursive: true })
  await mkdir(join(metadataPath, ".."), { recursive: true })
  await writeFile(join(entryPath, "SOURCE.md"), "stored source")
  await writeFile(metadataPath, JSON.stringify({ source: entry.source }))
}

afterEach(context.cleanup)

describe("install command", () => {
  it("reports an empty committed lockfile as a no-op", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    await initializeProject(projectPath, [])

    const result = await context.runCli({
      args: ["install"],
      homePath,
      projectPath,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("No locked references to install")
  })

  it("reports references that are already materialized", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const entry = repositoryEntry("example", "1.0.0")
    await initializeProject(projectPath, [entry])
    await materializeReference(projectPath, entry)

    const result = await context.runCli({
      args: ["install"],
      homePath,
      projectPath,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("1 reference is already installed")
    expect(result.output).toContain("All locked references are already installed")
    expect(result.output).not.toContain("Installed 1 locked reference")
  })

  it("reports references fetched from locked tarball metadata", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const archive = await createTarGzip([{ data: "source", name: "package/SOURCE.md" }])
    const server = Bun.serve({
      fetch: () => new Response(archive),
      port: 0,
    })

    try {
      const entry = tarballEntry("example", "1.0.0", new URL("example.tgz", server.url).href)
      await initializeProject(projectPath, [entry])

      const result = await context.runCli({
        args: ["install"],
        homePath,
        projectPath,
      })

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain("Fetched 1 reference")
    } finally {
      await server.stop(true)
    }
  })

  it("reports references reused from the global store", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const entry = tarballEntry(
      "example",
      "1.0.0",
      "https://registry.npmjs.org/example/-/example-1.0.0.tgz"
    )
    await initializeProject(projectPath, [entry])
    await materializeStoreEntry(homePath, entry)

    const result = await context.runCli({
      args: ["install"],
      homePath,
      projectPath,
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Reused 1 global store entry")
  })

  it("distinguishes Packref references from runtime dependencies in help", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()

    const installHelp = await context.runCli({
      args: ["install", "--help"],
      homePath,
      projectPath,
    })
    const rootHelp = await context.runCli({
      args: ["--help"],
      homePath,
      projectPath,
    })

    expect(installHelp.exitCode).toBe(0)
    expect(installHelp.output).toContain("not project dependencies")
    expect(rootHelp.output).toContain("install")
  })
})
