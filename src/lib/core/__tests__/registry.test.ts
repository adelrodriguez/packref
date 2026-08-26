import { describe, expect, it } from "vitest"
import { DEFAULT_REGISTRY, SUPPORTED_REGISTRIES, checkIsRegistry } from "#lib/core/registry.ts"

describe("registry", () => {
  it("exports the supported registries and default registry", () => {
    expect(SUPPORTED_REGISTRIES).toEqual(["npm"])
    expect(DEFAULT_REGISTRY).toBe("npm")
  })

  describe("checkIsRegistry", () => {
    it("checks whether a string is a supported registry", () => {
      expect(checkIsRegistry("npm")).toBe(true)
      expect(checkIsRegistry("jsr")).toBe(false)
      expect(checkIsRegistry("pypi")).toBe(false)
    })
  })
})
