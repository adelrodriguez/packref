import { describe, expect, it } from "bun:test"
import { join } from "node:path"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { InvalidPackageIdentity } from "#lib/core/errors.ts"
import { getStorePackagePath } from "#lib/store/paths.ts"

const run = <A, E>(effect: Effect.Effect<A, E, Path.Path>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Path.layer)))

const expectInvalidPackageIdentity = async (promise: Promise<unknown>) => {
  try {
    await promise
    throw new Error("Expected package identity validation to fail.")
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidPackageIdentity)
  }
}

describe("getStorePackagePath", () => {
  it("builds unscoped store paths", async () => {
    const identity = {
      name: "react",
      registry: "npm",
      version: "19.0.0",
    }

    const storePath = await run(getStorePackagePath("/store", identity))

    expect(storePath).toBe(join("/store", "packages", "npm", "react", "19.0.0"))
  })

  it("builds scoped store paths", async () => {
    const identity = {
      name: "@effect/cli",
      registry: "npm",
      version: "0.29.0",
    }

    const storePath = await run(getStorePackagePath("/store", identity))

    expect(storePath).toBe(join("/store", "packages", "npm", "@effect", "cli", "0.29.0"))
  })

  it("propagates package identity validation failures from store path builders", async () => {
    const identity = {
      name: "../react",
      registry: "npm",
      version: "19.0.0",
    }

    await expectInvalidPackageIdentity(run(getStorePackagePath("/store", identity)))
  })
})
