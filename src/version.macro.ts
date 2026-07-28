import { readFile } from "node:fs/promises"
import * as Schema from "effect/Schema"
import { MissingPackageVersion } from "#lib/core/errors.ts"

const PackageJsonSchema = Schema.Struct({
  version: Schema.optional(Schema.String),
})

export async function getPackageVersion() {
  const rawText = await readFile(new URL("../package.json", import.meta.url), "utf8")
  const packageJson = Schema.decodeUnknownSync(Schema.fromJsonString(PackageJsonSchema))(rawText)

  if (!packageJson.version) {
    throw new MissingPackageVersion({ path: "package.json" })
  }

  return packageJson.version
}
