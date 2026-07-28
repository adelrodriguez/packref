import { describe, expect, it } from "bun:test"
import * as Effect from "effect/Effect"
import { UnsupportedRegistryError } from "#lib/core/errors.ts"
import { getRegistryAdapter } from "#lib/registries/index.ts"

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

describe("getRegistryAdapter", () => {
  it("selects the npm registry adapter", async () => {
    const registry = await run(getRegistryAdapter("npm"))

    expect(registry.name).toBe("npm")
  })

  it("rejects unsupported registries", async () => {
    try {
      await run(getRegistryAdapter("jsr"))
      throw new Error("Expected registry lookup to fail.")
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedRegistryError)
    }
  })
})
