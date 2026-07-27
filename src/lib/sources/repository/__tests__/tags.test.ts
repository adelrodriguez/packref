import { describe, expect, it } from "bun:test"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { PackageIdentity } from "#lib/core/packages.ts"
import type { NormalizedRepositorySource } from "#lib/core/source.ts"
import { NetworkError, TagNotFoundError } from "#lib/core/errors.ts"
import { CommandRunner } from "#lib/services/command-runner.ts"
import { resolveRepositoryRef } from "#lib/sources/repository/normalize.ts"
import {
  getTagCandidates,
  listRemoteTags,
  matchRepositoryTag,
  parseGitRemoteTagsOutput,
} from "#lib/sources/repository/tags.ts"

const runWithCommandRunner = <A, E>(
  effect: Effect.Effect<A, E, CommandRunner>,
  run: CommandRunner["Service"]["run"]
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        Layer.succeed(CommandRunner)({
          run,
        })
      )
    )
  )

const reactIdentity = {
  name: "react",
  registry: "npm",
  version: "19.0.0",
} satisfies PackageIdentity

const repositorySource = {
  fetchSource: "github:facebook/react",
  host: "github.com",
  type: "repository",
  url: "https://github.com/facebook/react",
} satisfies NormalizedRepositorySource

describe("parseGitRemoteTagsOutput", () => {
  it("parses lightweight and annotated tags without duplicates", () => {
    const tags = parseGitRemoteTagsOutput(`
8f2b1f\trefs/tags/v19.0.0
8f2b1f\trefs/tags/v19.0.0^{}
95b3cd\trefs/tags/19.0.0
`)

    expect(tags).toEqual(["v19.0.0", "19.0.0"])
  })
})

describe("getTagCandidates", () => {
  it("returns tag candidates in priority order", () => {
    expect(getTagCandidates(reactIdentity)).toEqual(["v19.0.0", "19.0.0", "react@19.0.0"])
  })
})

describe("matchRepositoryTag", () => {
  it("matches tags in the documented priority order", () => {
    expect(matchRepositoryTag(reactIdentity, ["19.0.0", "react@19.0.0", "v19.0.0"])).toBe("v19.0.0")
  })

  it("supports scoped package names", () => {
    const identity = {
      name: "@effect/cli",
      registry: "npm",
      version: "0.29.0",
    } satisfies PackageIdentity

    expect(matchRepositoryTag(identity, ["@effect/cli@0.29.0"])).toBe("@effect/cli@0.29.0")
  })
})

describe("listRemoteTags", () => {
  it("lists parsed remote tags from git ls-remote output", async () => {
    const tags = await runWithCommandRunner(listRemoteTags(repositorySource), () =>
      Effect.succeed({
        exitCode: 0,
        stderr: "",
        stdout: "8f2b1f\trefs/tags/v19.0.0\n95b3cd\trefs/tags/19.0.0\n",
      })
    )

    expect(tags).toEqual(["v19.0.0", "19.0.0"])
  })

  it("maps command failures to NetworkError", async () => {
    try {
      await runWithCommandRunner(listRemoteTags(repositorySource), () =>
        Effect.succeed({
          exitCode: 128,
          stderr: "fatal: repository not found",
          stdout: "",
        })
      )
      throw new Error("Expected remote tag listing to fail.")
    } catch (error) {
      expect(error).toBeInstanceOf(NetworkError)
    }
  })
})

describe("resolveRepositoryRef", () => {
  it("resolves the matching remote tag for a normalized repository source candidate", async () => {
    const resolved = await runWithCommandRunner(
      resolveRepositoryRef(reactIdentity, {
        url: "git+https://github.com/facebook/react.git",
      }),
      () =>
        Effect.succeed({
          exitCode: 0,
          stderr: "",
          stdout: "8f2b1f\trefs/tags/19.0.0\n95b3cd\trefs/tags/v19.0.0\n",
        })
    )

    expect(resolved).toEqual({
      ref: "v19.0.0",
      source: repositorySource,
    })
  })

  it("fails with TagNotFoundError when no matching tag exists", async () => {
    try {
      await runWithCommandRunner(
        resolveRepositoryRef(reactIdentity, {
          url: "github:facebook/react",
        }),
        () =>
          Effect.succeed({
            exitCode: 0,
            stderr: "",
            stdout: "8f2b1f\trefs/tags/v18.3.1\n",
          })
      )
      throw new Error("Expected repository ref resolution to fail.")
    } catch (error) {
      expect(error).toBeInstanceOf(TagNotFoundError)
    }
  })
})
