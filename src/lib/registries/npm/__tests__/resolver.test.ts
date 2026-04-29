import { describe, expect, it } from "bun:test"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { ParsedPackageSpec } from "#lib/core/packages.ts"
import type { NpmPackageMetadata } from "#lib/registries/npm/metadata.ts"
import {
  NoRepositoryError,
  PackageNotFoundError,
  PackageVersionNotFoundError,
} from "#lib/core/errors.ts"
import { NpmRegistryClient } from "#lib/registries/npm/client.ts"
import npm from "#lib/registries/npm/resolver.ts"

const baseMetadata = {
  "dist-tags": {
    latest: "19.0.0",
  },
  name: "react",
  repository: {
    type: "git",
    url: "git+https://github.com/facebook/react.git",
  },
  versions: {
    "18.3.1": {
      version: "18.3.1",
    },
    "19.0.0": {
      repository: {
        directory: "packages/react",
        type: "git",
        url: "git+https://github.com/facebook/react.git",
      },
      version: "19.0.0",
    },
    "19.1.0": {
      version: "19.1.0",
    },
  },
} satisfies NpmPackageMetadata

const spec = (specifier?: string): ParsedPackageSpec => ({
  name: "react",
  registry: "npm",
  specifier,
})

const runWithMetadata = <A, E>(
  effect: Effect.Effect<A, E, NpmRegistryClient>,
  metadata: NpmPackageMetadata = baseMetadata
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        Layer.succeed(NpmRegistryClient)({
          getPackageMetadata: () => Effect.succeed(metadata),
        })
      )
    )
  )

describe("npm", () => {
  describe("resolve", () => {
    it("resolves omitted specifiers through the latest dist tag", async () => {
      const resolved = await runWithMetadata(npm.resolve(spec()))

      expect(resolved.identity).toEqual({
        name: "react",
        registry: "npm",
        version: "19.0.0",
      })
      expect(resolved.source).toEqual({
        directory: "packages/react",
        url: "git+https://github.com/facebook/react.git",
      })
    })

    it("resolves exact versions", async () => {
      const resolved = await runWithMetadata(npm.resolve(spec("18.3.1")))

      expect(resolved.identity.version).toBe("18.3.1")
      expect(resolved.source).toEqual({
        url: "git+https://github.com/facebook/react.git",
      })
    })

    it("resolves semver ranges to the highest satisfying version", async () => {
      const resolved = await runWithMetadata(npm.resolve(spec("^19.0.0")))

      expect(resolved.identity.version).toBe("19.1.0")
    })

    it("returns PackageNotFoundError from the registry client", async () => {
      try {
        await Effect.runPromise(
          npm.resolve(spec()).pipe(
            Effect.provide(
              Layer.succeed(NpmRegistryClient)({
                getPackageMetadata: (name) =>
                  Effect.fail(
                    new PackageNotFoundError({
                      name,
                      registry: "npm",
                    })
                  ),
              })
            )
          )
        )
        throw new Error("Expected npm package resolution to fail.")
      } catch (error) {
        expect(error).toBeInstanceOf(PackageNotFoundError)
      }
    })

    it("returns PackageVersionNotFoundError for missing version metadata", async () => {
      try {
        await runWithMetadata(npm.resolve(spec("20.0.0")))
        throw new Error("Expected npm package resolution to fail.")
      } catch (error) {
        expect(error).toBeInstanceOf(PackageVersionNotFoundError)
      }
    })

    it("returns NoRepositoryError when the resolved version has no repository metadata", async () => {
      const metadata = {
        "dist-tags": {
          latest: "1.0.0",
        },
        name: "missing-repo",
        versions: {
          "1.0.0": {
            version: "1.0.0",
          },
        },
      } satisfies NpmPackageMetadata

      try {
        await runWithMetadata(npm.resolve(spec()), metadata)
        throw new Error("Expected npm package resolution to fail.")
      } catch (error) {
        expect(error).toBeInstanceOf(NoRepositoryError)
      }
    })
  })
})
