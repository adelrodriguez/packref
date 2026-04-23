import * as Schema from "effect/Schema"

export const PackageJsonSchema = Schema.Struct({
  version: Schema.optional(Schema.String),
})
