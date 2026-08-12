import { describe, expect, it } from "bun:test"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import {
  InvalidPackageIdentity,
  UnsupportedRegistryError,
  UnsupportedRepositoryHostError,
} from "#lib/core/errors.ts"
import {
  packageCoordinatesEquivalence,
  packageCoordinatesOrder,
  type PackageIdentity,
} from "#lib/core/packages.ts"
import { getPackageIdentitySegments, parsePackageSpec } from "#lib/logic/packages.ts"

const runEffect = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

interface InvalidPackageIdentityExpectation {
  readonly field: "name" | "registry" | "version"
  readonly reason: string
  readonly value: string
}

const expectInvalidPackageIdentity = async (
  promise: Promise<unknown>,
  expected?: InvalidPackageIdentityExpectation
) => {
  try {
    await promise
    throw new Error("Expected package identity validation to fail.")
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidPackageIdentity)

    if (expected !== undefined) {
      expect(error).toMatchObject(expected)
    }
  }
}

describe("packages", () => {
  describe("package coordinates", () => {
    it("compares registry and name without considering other fields", () => {
      const react18: PackageIdentity = { name: "react", registry: "npm", version: "18.0.0" }
      const react19: PackageIdentity = { name: "react", registry: "npm", version: "19.0.0" }

      expect(packageCoordinatesEquivalence(react18, react19)).toBe(true)
    })

    it("orders by registry and then package name", () => {
      const coordinates = [
        { name: "zod", registry: "npm" },
        { name: "effect", registry: "npm" },
        { name: "react", registry: "jsr" },
      ]

      expect(Array.sort(coordinates, packageCoordinatesOrder)).toEqual([
        { name: "react", registry: "jsr" },
        { name: "effect", registry: "npm" },
        { name: "zod", registry: "npm" },
      ])
    })
  })

  describe("getPackageIdentitySegments", () => {
    it("builds unscoped package identity segments", async () => {
      const identity = {
        name: "react",
        registry: "npm",
        version: "19.0.0",
      }

      const segments = await runEffect(getPackageIdentitySegments(identity))

      expect(segments).toEqual(["packages", "npm", "react", "19.0.0"])
    })

    it("builds scoped package identity segments", async () => {
      const identity = {
        name: "@effect/cli",
        registry: "npm",
        version: "0.29.0",
      }

      const segments = await runEffect(getPackageIdentitySegments(identity))

      expect(segments).toEqual(["packages", "npm", "@effect", "cli", "0.29.0"])
    })

    it.each([
      {
        expected: { field: "name", reason: "must not be empty", value: "" },
        identity: { name: "", registry: "npm", version: "19.0.0" },
        label: "empty name",
      },
      {
        expected: { field: "name", reason: "must not be a reserved path segment", value: "." },
        identity: { name: ".", registry: "npm", version: "19.0.0" },
        label: "reserved name segment",
      },
      {
        expected: { field: "name", reason: "must not be a reserved path segment", value: ".." },
        identity: { name: "..", registry: "npm", version: "19.0.0" },
        label: "traversal name segment",
      },
      {
        expected: { field: "name", reason: "must not be a reserved path segment", value: ".." },
        identity: { name: "../react", registry: "npm", version: "19.0.0" },
        label: "name containing a slash",
      },
      {
        expected: {
          field: "name",
          reason: "must not contain path separators",
          value: "react\\dom",
        },
        identity: { name: "react\\dom", registry: "npm", version: "19.0.0" },
        label: "name containing a backslash",
      },
      {
        expected: { field: "registry", reason: "must not be empty", value: "" },
        identity: { name: "react", registry: "", version: "19.0.0" },
        label: "empty registry",
      },
      {
        expected: { field: "registry", reason: "must not be a reserved path segment", value: "." },
        identity: { name: "react", registry: ".", version: "19.0.0" },
        label: "reserved registry segment",
      },
      {
        expected: { field: "registry", reason: "must not be a reserved path segment", value: ".." },
        identity: { name: "react", registry: "..", version: "19.0.0" },
        label: "traversal registry segment",
      },
      {
        expected: {
          field: "registry",
          reason: "must not contain path separators",
          value: "../npm",
        },
        identity: { name: "react", registry: "../npm", version: "19.0.0" },
        label: "registry containing a slash",
      },
      {
        expected: {
          field: "registry",
          reason: "must not contain path separators",
          value: "npm\\mirror",
        },
        identity: { name: "react", registry: "npm\\mirror", version: "19.0.0" },
        label: "registry containing a backslash",
      },
      {
        expected: { field: "version", reason: "must not be empty", value: "" },
        identity: { name: "react", registry: "npm", version: "" },
        label: "empty version",
      },
      {
        expected: { field: "version", reason: "must not be a reserved path segment", value: "." },
        identity: { name: "react", registry: "npm", version: "." },
        label: "reserved version segment",
      },
      {
        expected: { field: "version", reason: "must not be a reserved path segment", value: ".." },
        identity: { name: "react", registry: "npm", version: ".." },
        label: "traversal version segment",
      },
      {
        expected: {
          field: "version",
          reason: "must not contain path separators",
          value: "19/0/0",
        },
        identity: { name: "react", registry: "npm", version: "19/0/0" },
        label: "version containing a slash",
      },
      {
        expected: {
          field: "version",
          reason: "must not contain path separators",
          value: "19\\0\\0",
        },
        identity: { name: "react", registry: "npm", version: "19\\0\\0" },
        label: "version containing a backslash",
      },
      {
        expected: { field: "name", reason: "must not be empty", value: "" },
        identity: { name: "@effect/", registry: "npm", version: "0.29.0" },
        label: "scoped name with an empty package segment",
      },
      {
        expected: { field: "name", reason: "must not be a reserved path segment", value: "." },
        identity: { name: "@effect/.", registry: "npm", version: "0.29.0" },
        label: "scoped name with a reserved package segment",
      },
      {
        expected: { field: "name", reason: "must not be a reserved path segment", value: ".." },
        identity: { name: "@effect/..", registry: "npm", version: "0.29.0" },
        label: "scoped name with a traversal package segment",
      },
      {
        expected: {
          field: "name",
          reason: "must not contain path separators",
          value: "cli\\core",
        },
        identity: { name: "@effect/cli\\core", registry: "npm", version: "0.29.0" },
        label: "scoped name package segment containing a backslash",
      },
    ] satisfies ReadonlyArray<{
      expected: InvalidPackageIdentityExpectation
      identity: PackageIdentity
      label: string
    }>)("rejects invalid path segments: $label", async ({ expected, identity }) => {
      await expectInvalidPackageIdentity(runEffect(getPackageIdentitySegments(identity)), expected)
    })

    it.each([
      {
        expected: {
          field: "name",
          reason: "scoped package names must include a non-empty scope",
          value: "@/cli",
        },
        identity: { name: "@/cli", registry: "npm", version: "0.29.0" },
        label: "scoped name with an empty scope",
      },
      {
        expected: {
          field: "name",
          reason: "scoped package names must contain exactly one scope separator",
          value: "@effect",
        },
        identity: { name: "@effect", registry: "npm", version: "0.29.0" },
        label: "scoped name without a package segment",
      },
      {
        expected: {
          field: "name",
          reason: "scoped package names must contain exactly one scope separator",
          value: "@effect/cli/extra",
        },
        identity: { name: "@effect/cli/extra", registry: "npm", version: "0.29.0" },
        label: "scoped name with too many separators",
      },
    ] satisfies ReadonlyArray<{
      expected: InvalidPackageIdentityExpectation
      identity: PackageIdentity
      label: string
    }>)("rejects malformed scoped package names: $label", async ({ expected, identity }) => {
      await expectInvalidPackageIdentity(runEffect(getPackageIdentitySegments(identity)), expected)
    })
  })

  describe("parsePackageSpec", () => {
    it.each([
      {
        expected: { _tag: "registry", name: "react", registry: "npm" },
        input: "react",
        label: "defaults unscoped packages to npm",
      },
      {
        expected: { _tag: "registry", name: "react", registry: "npm", specifier: "19.0.0" },
        input: "react@19.0.0",
        label: "preserves exact versions",
      },
      {
        expected: { _tag: "registry", name: "react", registry: "npm", specifier: "^19.0.0" },
        input: "react@^19.0.0",
        label: "preserves ranges",
      },
      {
        expected: { _tag: "registry", name: "@effect/cli", registry: "npm" },
        input: "@effect/cli",
        label: "parses scoped packages without versions",
      },
      {
        expected: { _tag: "registry", name: "react", registry: "npm" },
        input: "npm:react",
        label: "accepts explicit npm prefix",
      },
      {
        expected: { _tag: "registry", name: "react", registry: "npm" },
        input: "npm: react",
        label: "trims package names after explicit prefixes",
      },
      {
        expected: {
          _tag: "registry",
          name: "@effect/cli",
          registry: "npm",
          specifier: "0.29.0",
        },
        input: "npm:@effect/cli@0.29.0",
        label: "accepts scoped packages with explicit npm prefix and versions",
      },
      {
        expected: { _tag: "registry", name: "react", registry: "npm" },
        input: "react@",
        label: "omits empty unscoped package specifiers",
      },
      {
        expected: { _tag: "registry", name: "@effect/cli", registry: "npm" },
        input: "npm:@effect/cli@",
        label: "omits empty scoped package specifiers",
      },
    ])("$label", async ({ expected, input }) => {
      expect(await runEffect(parsePackageSpec(input))).toEqual(expected)
    })

    it("builds direct repository identity segments", async () => {
      expect(
        await runEffect(
          getPackageIdentitySegments({
            name: "effect-ts/effect",
            registry: "github",
            version: "abc123def456",
          })
        )
      ).toEqual(["packages", "github", "effect-ts", "effect", "abc123def456"])
    })

    it.each([
      {
        expected: {
          _tag: "repository",
          name: "effect-ts/effect",
          registry: "github",
          repository: { url: "github:effect-ts/effect" },
        },
        input: "github:effect-ts/effect",
      },
      {
        expected: {
          _tag: "repository",
          name: "effect-ts/effect",
          registry: "github",
          repository: { url: "effect-ts/effect" },
          specifier: "v3.0.0",
        },
        input: "effect-ts/effect@v3.0.0",
      },
      {
        expected: {
          _tag: "repository",
          name: "effect-ts/effect",
          registry: "github",
          repository: { url: "effect-ts/effect" },
        },
        input: "effect-ts/effect@",
      },
      {
        expected: {
          _tag: "repository",
          name: "owner/repo",
          registry: "github",
          repository: { url: "https://github.com/owner/repo" },
        },
        input: "github.com/owner/repo",
      },
      {
        expected: {
          _tag: "repository",
          name: "owner/repo",
          registry: "gitlab",
          repository: { url: "https://gitlab.com/owner/repo" },
        },
        input: "gitlab.com/owner/repo",
      },
      {
        expected: {
          _tag: "repository",
          name: "owner/repo",
          registry: "bitbucket",
          repository: { url: "https://bitbucket.org/owner/repo" },
        },
        input: "bitbucket.org/owner/repo",
      },
      {
        expected: {
          _tag: "repository",
          name: "owner/repo",
          registry: "sourcehut",
          repository: { url: "https://git.sr.ht/~owner/repo" },
        },
        input: "git.sr.ht/~owner/repo",
      },
      {
        expected: {
          _tag: "repository",
          name: "owner/repo",
          registry: "sourcehut",
          repository: { url: "sourcehut:~owner/repo" },
        },
        input: "~owner/repo",
      },
      {
        expected: {
          _tag: "repository",
          name: "owner/repo",
          registry: "sourcehut",
          repository: { url: "sourcehut:~owner/repo" },
        },
        input: "sourcehut:~owner/repo",
      },
      {
        expected: {
          _tag: "repository",
          name: "owner/repo",
          registry: "gitlab",
          repository: { directory: "packages/core", url: "gitlab:owner/repo" },
          specifier: "release/next",
        },
        input: "gitlab:owner/repo/packages/core@release/next",
      },
      {
        expected: {
          _tag: "repository",
          name: "owner/repo",
          registry: "github",
          repository: { url: "git@github.com:owner/repo.git" },
        },
        input: "git@github.com:owner/repo.git",
      },
      {
        expected: {
          _tag: "repository",
          name: "owner/repo",
          registry: "github",
          repository: { url: "ssh://git@github.com/owner/repo" },
          specifier: "main",
        },
        input: "ssh://git@github.com/owner/repo@main",
      },
    ])("parses direct repository spec $input", async ({ expected, input }) => {
      expect(await runEffect(parsePackageSpec(input))).toEqual(expected)
    })

    it.each(["https://git.example.com/owner/repo", "git@git.example.com:owner/repo.git"])(
      "rejects unsupported repository hosts: %s",
      async (input) => {
        try {
          await runEffect(parsePackageSpec(input))
          throw new Error("Expected package spec parsing to fail.")
        } catch (error) {
          expect(error).toBeInstanceOf(UnsupportedRepositoryHostError)
          expect(error).toMatchObject({ host: "git.example.com", url: input })
        }
      }
    )

    it.each(["git.mycompany.com/owner/repo", "bitbucket.org.evil.com/owner/repo"])(
      "rejects host-shaped shorthands on unsupported hosts: %s",
      async (input) => {
        try {
          await runEffect(parsePackageSpec(input))
          throw new Error("Expected package spec parsing to fail.")
        } catch (error) {
          expect(error).toBeInstanceOf(UnsupportedRepositoryHostError)
          expect(error).toMatchObject({ host: input.split("/")[0], url: input })
        }
      }
    )

    it.each(["https://github.com/owner", "github.com/owner", "github:owner", "sourcehut:~owner"])(
      "rejects repository locators without a repository name: %s",
      async (input) => {
        try {
          await runEffect(parsePackageSpec(input))
          throw new Error("Expected package spec parsing to fail.")
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidPackageIdentity)
          expect(error).toMatchObject({ field: "name", value: input })
        }
      }
    )

    it.each([
      "https://gitlab.com/group/subgroup/repo",
      "gitlab.com/group/subgroup/repo",
      "git@gitlab.com:group/subgroup/repo.git",
    ])("rejects nested GitLab subgroup paths: %s", async (input) => {
      try {
        await runEffect(parsePackageSpec(input))
        throw new Error("Expected package spec parsing to fail.")
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidPackageIdentity)
        expect(error).toMatchObject({
          field: "name",
          reason: "nested GitLab subgroup paths are not supported",
          value: input,
        })
      }
    })

    it.each(["jsr:effect", "pypi:requests"])(
      "rejects unsupported registry prefixes: %s",
      async (input) => {
        try {
          await runEffect(parsePackageSpec(input))
          throw new Error("Expected package spec parsing to fail.")
        } catch (error) {
          expect(error).toBeInstanceOf(UnsupportedRegistryError)
        }
      }
    )

    it.each(["", "   ", "npm:", "npm:   "])("rejects empty package specs: %j", async (input) => {
      await expectInvalidPackageIdentity(runEffect(parsePackageSpec(input)), {
        field: "name",
        reason: "must not be empty",
        value: "",
      })
    })
  })
})
