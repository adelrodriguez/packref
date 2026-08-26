import * as Effect from "effect/Effect"
import { describe, expect, it } from "vitest"
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
            dist: {
              tarball: "https://registry.npmjs.org/@effect/cli/-/cli-1.0.0.tgz",
            },
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
            dist: {
              tarball: "https://registry.npmjs.org/react/-/react-18.3.1.tgz",
            },
            repository: "github:facebook/react",
            version: "18.3.1",
          },
        },
      })
    )

    expect(metadata.repository).toBe("github:facebook/react")
    expect(metadata.versions["18.3.1"]?.repository).toBe("github:facebook/react")
  })

  it("allows additional npm metadata fields", async () => {
    const metadata = await run(
      decodeNpmPackageMetadata({
        description: "A package",
        "dist-tags": {
          latest: "1.0.0",
          next: "2.0.0-beta.1",
        },
        name: "example",
        repository: {
          bugs: "https://github.com/example/example/issues",
          type: "git",
          url: "git+https://github.com/example/example.git",
        },
        versions: {
          "1.0.0": {
            dependencies: {
              effect: "^4.0.0",
            },
            dist: {
              tarball: "https://registry.npmjs.org/example/-/example-1.0.0.tgz",
            },
            version: "1.0.0",
          },
        },
      })
    )

    expect(metadata.name).toBe("example")
    expect(metadata.versions["1.0.0"]?.version).toBe("1.0.0")
  })
})
