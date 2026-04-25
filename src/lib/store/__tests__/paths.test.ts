import { describe, expect, it } from "bun:test"
import { join } from "node:path"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { InvalidPackageIdentity } from "#lib/core/errors.ts"
import {
  getPackageIdentityPath,
  getPackageIdentitySegments,
  getStorePackagePath,
  type PackageIdentity,
} from "#lib/store/paths.ts"

const run = <A, E>(effect: Effect.Effect<A, E, Path.Path>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Path.layer)))

const runSegments = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

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

describe("store paths", () => {
  describe("getPackageIdentitySegments", () => {
    it("builds unscoped package identity segments", async () => {
      const identity = {
        name: "react",
        registry: "npm",
        version: "19.0.0",
      }

      const segments = await runSegments(getPackageIdentitySegments(identity))

      expect(segments).toEqual(["packages", "npm", "react", "19.0.0"])
    })

    it("builds scoped package identity segments", async () => {
      const identity = {
        name: "@effect/cli",
        registry: "npm",
        version: "0.29.0",
      }

      const segments = await runSegments(getPackageIdentitySegments(identity))

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
        expected: { field: "name", reason: "must not contain path separators", value: "../react" },
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
      await expectInvalidPackageIdentity(
        runSegments(getPackageIdentitySegments(identity)),
        expected
      )
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
      await expectInvalidPackageIdentity(
        runSegments(getPackageIdentitySegments(identity)),
        expected
      )
    })
  })

  it("builds unscoped package identity paths", async () => {
    const identity = {
      name: "react",
      registry: "npm",
      version: "19.0.0",
    }

    const identityPath = await run(getPackageIdentityPath(identity))
    const storePath = await run(getStorePackagePath("/store", identity))

    expect(identityPath).toBe(join("packages", "npm", "react", "19.0.0"))
    expect(storePath).toBe(join("/store", "packages", "npm", "react", "19.0.0"))
  })

  it("builds scoped package identity paths", async () => {
    const identity = {
      name: "@effect/cli",
      registry: "npm",
      version: "0.29.0",
    }

    const identityPath = await run(getPackageIdentityPath(identity))
    const storePath = await run(getStorePackagePath("/store", identity))

    expect(identityPath).toBe(join("packages", "npm", "@effect", "cli", "0.29.0"))
    expect(storePath).toBe(join("/store", "packages", "npm", "@effect", "cli", "0.29.0"))
  })

  it("propagates package identity validation failures from path builders", async () => {
    const identity = {
      name: "../react",
      registry: "npm",
      version: "19.0.0",
    }

    await expectInvalidPackageIdentity(run(getPackageIdentityPath(identity)))
    await expectInvalidPackageIdentity(run(getStorePackagePath("/store", identity)))
  })
})
