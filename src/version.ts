import { readFile } from "node:fs/promises"

export async function getPackageVersion() {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  ) as { version?: string }

  if (!packageJson.version) {
    throw new Error("Missing version field in package.json")
  }

  return packageJson.version
}
