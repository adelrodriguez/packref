import { describe, expect, it } from "bun:test"
import * as Effect from "effect/Effect"
import { decodeNpmPackageMetadata } from "#lib/registries/npm/metadata.ts"

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

describe("decodeNpmPackageMetadata", () => {
  it("decodes repository object metadata with a directory", async () => {
    const metadata = await run(
      decodeNpmPackageMetadata({
        "dist-tags": {
          latest: "1.0.0",
        },
        name: "@effect/cli",
        repository: {
          directory: "packages/cli",
          type: "git",
          url: "git+https://github.com/Effect-TS/effect.git",
        },
        versions: {
          "1.0.0": {
            repository: {
              directory: "packages/cli",
              type: "git",
              url: "git+https://github.com/Effect-TS/effect.git",
            },
            version: "1.0.0",
          },
        },
      })
    )

    expect(metadata.repository).toEqual({
      directory: "packages/cli",
      type: "git",
      url: "git+https://github.com/Effect-TS/effect.git",
    })
  })

  it("decodes repository string metadata", async () => {
    const metadata = await run(
      decodeNpmPackageMetadata({
        "dist-tags": {
          latest: "18.3.1",
        },
        name: "react",
        repository: "github:facebook/react",
        versions: {
          "18.3.1": {
            repository: "github:facebook/react",
            version: "18.3.1",
          },
        },
      })
    )

    expect(metadata.repository).toBe("github:facebook/react")
    expect(metadata.versions["18.3.1"]?.repository).toBe("github:facebook/react")
  })
})
