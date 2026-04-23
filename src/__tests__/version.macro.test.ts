import { describe, expect, it } from "bun:test"
import { getPackageVersion } from "#version.macro.ts"

describe("getPackageVersion", () => {
  it("should return a valid semver version string", async () => {
    const version = await getPackageVersion()
    expect(version).toMatch(
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
    )
  })
})
