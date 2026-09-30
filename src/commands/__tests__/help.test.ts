import { afterEach, describe, expect, it } from "vitest"
import { makeCommandTestContext } from "#commands/__tests__/helpers.ts"

const context = makeCommandTestContext("packref-help-command-test-")

afterEach(context.cleanup)

describe("CLI help", () => {
  it("lists every v1 command with useful descriptions", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const result = await context.runCli({ args: ["--help"], homePath, projectPath })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("Local, versioned package references for your agents")
    expect(result.output).toMatch(/^[ \t]*add[ \t]+Add a package source reference\b/m)
    expect(result.output).toMatch(/^[ \t]*clean[ \t]+Clear current-project references\b/m)
    expect(result.output).toMatch(/^[ \t]*init[ \t]+Initialize Packref files\b/m)
    expect(result.output).toMatch(/^[ \t]*install[ \t]+Install Packref source references\b/m)
    expect(result.output).toMatch(/^[ \t]*list, ls[ \t]+List package source references\b/m)
    expect(result.output).toMatch(/^[ \t]*prune[ \t]+Remove global store entries\b/m)
    expect(result.output).toMatch(/^[ \t]*remove, rm[ \t]+Remove package source references\b/m)
    expect(result.output).toMatch(/^[ \t]*sync[ \t]+Update dependency-tracked references\b/m)
  })

  it("does not expose the internal help signal", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const [empty, unknown] = await Promise.all([
      context.runCli({ args: [], homePath, projectPath }),
      context.runCli({ args: ["unknown"], homePath, projectPath }),
    ])

    expect(empty.exitCode).toBe(0)
    expect(empty.output).toContain("USAGE")
    expect(empty.output).not.toContain("Help requested")
    expect(unknown.exitCode).toBe(1)
    expect(unknown.output).toContain('Unknown subcommand "unknown"')
    expect(unknown.output).not.toContain("Help requested")
  })
})
