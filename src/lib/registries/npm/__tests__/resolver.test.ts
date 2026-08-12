import { describe, expect, it } from "bun:test"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type { RegistryPackageSpec } from "#lib/core/packages.ts"
import type { NpmPackageMetadata } from "#lib/registries/npm/metadata.ts"
import { PackageNotFoundError, PackageVersionNotFoundError } from "#lib/core/errors.ts"
import { NpmRegistryClient } from "#lib/registries/npm/client.ts"
import npm, { resolveVersion } from "#lib/registries/npm/resolver.ts"

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
      dist: {
        tarball: "https://registry.npmjs.org/react/-/react-18.3.1.tgz",
      },
      version: "18.3.1",
    },
    "19.0.0": {
      dist: {
        tarball: "https://registry.npmjs.org/react/-/react-19.0.0.tgz",
      },
      repository: {
        directory: "packages/react",
        type: "git",
        url: "git+https://github.com/facebook/react.git",
      },
      version: "19.0.0",
    },
    "19.1.0": {
      dist: {
        tarball: "https://registry.npmjs.org/react/-/react-19.1.0.tgz",
      },
      version: "19.1.0",
    },
  },
} satisfies NpmPackageMetadata

const spec = (specifier?: string): RegistryPackageSpec => ({
  _tag: "registry",
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
  describe("resolveVersion", () => {
    it("returns Some for a matching version", () => {
      expect(Option.getOrThrow(resolveVersion(baseMetadata, "^19.0.0"))).toBe("19.1.0")
    })

    it("returns None for a missing version", () => {
      expect(Option.isNone(resolveVersion(baseMetadata, "20.0.0"))).toBe(true)
    })
  })

  describe("resolve", () => {
    it("resolves omitted specifiers through the latest dist tag", async () => {
      const resolved = await runWithMetadata(npm.resolve(spec()))

      expect(resolved.identity).toEqual({
        name: "react",
        registry: "npm",
        version: "19.0.0",
      })
      expect(resolved.repository).toEqual({
        directory: "packages/react",
        url: "git+https://github.com/facebook/react.git",
      })
      expect(resolved.tarballUrl).toBe("https://registry.npmjs.org/react/-/react-19.0.0.tgz")
    })

    it("resolves exact versions", async () => {
      const resolved = await runWithMetadata(npm.resolve(spec("18.3.1")))

      expect(resolved.identity.version).toBe("18.3.1")
      expect(resolved.repository).toEqual({
        url: "git+https://github.com/facebook/react.git",
      })
    })

    it("normalizes exact versions before metadata lookup", async () => {
      const resolved = await runWithMetadata(npm.resolve(spec("v18.3.1")))

      expect(resolved.identity.version).toBe("18.3.1")
    })

    it("resolves semver ranges to the highest satisfying version", async () => {
      const resolved = await runWithMetadata(npm.resolve(spec("^19.0.0")))

      expect(resolved.identity.version).toBe("19.1.0")
    })

    it("excludes prereleases from ranges that do not request them", async () => {
      const metadata = {
        ...baseMetadata,
        versions: {
          "19.0.0": {
            dist: {
              tarball: "https://registry.npmjs.org/react/-/react-19.0.0.tgz",
            },
            version: "19.0.0",
          },
          "19.1.0-beta.1": {
            dist: {
              tarball: "https://registry.npmjs.org/react/-/react-19.1.0-beta.1.tgz",
            },
            version: "19.1.0-beta.1",
          },
        },
      } satisfies NpmPackageMetadata
      const resolved = await runWithMetadata(npm.resolve(spec("^19.0.0")), metadata)

      expect(resolved.identity.version).toBe("19.0.0")
    })

    it("returns PackageNotFoundError from the registry client", () => {
      const resolution = Effect.runPromise(
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

      expect(resolution).rejects.toBeInstanceOf(PackageNotFoundError)
    })

    it("returns PackageVersionNotFoundError for missing version metadata", () => {
      expect(runWithMetadata(npm.resolve(spec("20.0.0")))).rejects.toBeInstanceOf(
        PackageVersionNotFoundError
      )
    })

    it("returns PackageVersionNotFoundError when latest has no version metadata", () => {
      const metadata = {
        ...baseMetadata,
        "dist-tags": { latest: "20.0.0" },
      } satisfies NpmPackageMetadata

      expect(runWithMetadata(npm.resolve(spec()), metadata)).rejects.toBeInstanceOf(
        PackageVersionNotFoundError
      )
    })

    it("returns a tarball fallback candidate when the resolved version has no repository metadata", async () => {
      const metadata = {
        "dist-tags": {
          latest: "1.0.0",
        },
        name: "missing-repo",
        versions: {
          "1.0.0": {
            dist: {
              tarball: "https://registry.npmjs.org/missing-repo/-/missing-repo-1.0.0.tgz",
            },
            version: "1.0.0",
          },
        },
      } satisfies NpmPackageMetadata

      const resolved = await runWithMetadata(npm.resolve(spec()), metadata)

      expect(resolved.repository).toBeUndefined()
      expect(resolved.tarballUrl).toBe(
        "https://registry.npmjs.org/missing-repo/-/missing-repo-1.0.0.tgz"
      )
    })
  })
})
