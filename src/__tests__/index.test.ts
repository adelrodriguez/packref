import { describe, expect, it } from "bun:test"
import { getPackageVersion } from "../version"

describe("getPackageVersion", () => {
  it("should return the package version", async () => {
    const version = await getPackageVersion()
    expect(version).toBe("0.0.0")
  })
})
