import * as Effect from "effect/Effect"
import { describe, expect, it } from "vitest"
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

      if (error instanceof UnsupportedRegistryError) {
        expect(error.message).toBe("Unsupported registry prefix `jsr`. Supported registries: npm.")
      }
    }
  })
})
