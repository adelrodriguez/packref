import { describe, expect, it } from "bun:test"
import * as Effect from "effect/Effect"
import type { RepositorySourceCandidate } from "#lib/core/source.ts"
import { InvalidRepositoryUrlError } from "#lib/core/errors.ts"
import { normalizeRepositorySource } from "#lib/sources/repository/normalize.ts"

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

describe("normalizeRepositorySource", () => {
  it("normalizes git+https GitHub repository URLs into GitHub fetch sources", async () => {
    const normalized = await run(
      normalizeRepositorySource({
        directory: "packages/react",
        url: "git+https://github.com/facebook/react.git",
      })
    )

    expect(normalized).toEqual({
      directory: "packages/react",
      fetchSource: "github:facebook/react",
      host: "github.com",
      type: "repository",
      url: "https://github.com/facebook/react",
    })
  })

  it("normalizes GitHub shorthand repository URLs", async () => {
    const normalized = await run(
      normalizeRepositorySource({
        url: "github:effect-ts/effect",
      })
    )

    expect(normalized).toEqual({
      fetchSource: "github:effect-ts/effect",
      host: "github.com",
      type: "repository",
      url: "https://github.com/effect-ts/effect",
    })
  })

  it("normalizes SCP-style SSH repository URLs", async () => {
    const normalized = await run(
      normalizeRepositorySource({
        url: "git@github.com:facebook/react.git",
      })
    )

    expect(normalized).toEqual({
      fetchSource: "github:facebook/react",
      host: "github.com",
      type: "repository",
      url: "https://github.com/facebook/react",
    })
  })

  it.each([
    {
      fetchSource: "sourcehut:example/project",
      label: "standard HTTPS",
      url: "https://git.sr.ht/~example/project.git",
    },
    {
      fetchSource: "sourcehut:example/project",
      label: "SourceHut shorthand",
      url: "sourcehut:~example/project",
    },
  ])("normalizes $label repository URLs", async ({ fetchSource, url }) => {
    const normalized = await run(normalizeRepositorySource({ url }))

    expect(normalized).toEqual({
      fetchSource,
      host: "git.sr.ht",
      type: "repository",
      url: "https://git.sr.ht/~example/project",
    })
  })

  it("marks unknown hosts as not fetchable", async () => {
    const normalized = await run(
      normalizeRepositorySource({
        directory: "packages/internal",
        url: "https://code.example.com/acme/internal-tool.git",
      })
    )

    expect(normalized).toEqual({
      directory: "packages/internal",
      fetchSource: undefined,
      host: "code.example.com",
      type: "repository",
      url: "https://code.example.com/acme/internal-tool",
    })
  })

  it.each([
    {
      candidate: { url: "github:" },
      label: "empty shorthand repository path",
    },
    {
      candidate: { url: "not a repository" },
      label: "unsupported repository string",
    },
    {
      candidate: { url: "https://github.com/" },
      label: "empty URL path",
    },
  ] satisfies ReadonlyArray<{ candidate: RepositorySourceCandidate; label: string }>)(
    "rejects invalid repository URLs: $label",
    async ({ candidate }) => {
      try {
        await run(normalizeRepositorySource(candidate))
        throw new Error("Expected repository normalization to fail.")
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidRepositoryUrlError)
      }
    }
  )
})
