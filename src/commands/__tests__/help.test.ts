import { afterEach, describe, expect, it } from "bun:test"
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
    expect(result.output).toMatch(/^[ \t]*list[ \t]+List package source references\b/m)
    expect(result.output).toMatch(/^[ \t]*prune[ \t]+Remove global store entries\b/m)
    expect(result.output).toMatch(/^[ \t]*remove[ \t]+Remove package source references\b/m)
    expect(result.output).toMatch(/^[ \t]*sync[ \t]+Update dependency-tracked references\b/m)
  })

  it("documents optional package selection and global cleaning", async () => {
    const projectPath = await context.makeTempDirectory()
    const homePath = await context.makeTempDirectory()
    const [addHelp, removeHelp, cleanHelp] = await Promise.all([
      context.runCli({ args: ["add", "--help"], homePath, projectPath }),
      context.runCli({ args: ["remove", "--help"], homePath, projectPath }),
      context.runCli({ args: ["clean", "--help"], homePath, projectPath }),
    ])

    expect(addHelp.exitCode).toBe(0)
    expect(addHelp.output).toContain("[<package>]")
    expect(addHelp.output).toContain("optional version")
    expect(removeHelp.exitCode).toBe(0)
    expect(removeHelp.output).toContain("[<package>]")
    expect(cleanHelp.exitCode).toBe(0)
    expect(cleanHelp.output).toContain("--global, -g")
    expect(cleanHelp.output).toContain("global Packref store")
  })
})
