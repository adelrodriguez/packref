import * as Schema from "effect/Schema"

export const PackageJsonSchema = Schema.Struct({
  version: Schema.optional(Schema.String),
})

export const RepositorySourceSchema = Schema.Struct({
  directory: Schema.optional(Schema.String),
  host: Schema.String,
  type: Schema.Literal("repository"),
  url: Schema.String,
})

export const PackageEntrySchema = Schema.Struct({
  name: Schema.String,
  registry: Schema.String,
  source: RepositorySourceSchema,
  tracking: Schema.Union([Schema.Literal("manual"), Schema.Literal("dependency")]),
  version: Schema.String,
})

export const LockfileSchema = Schema.Struct({
  packages: Schema.Array(PackageEntrySchema),
})
export type Lockfile = typeof LockfileSchema.Type

export const GlobalConfigSchema = Schema.Struct({
  projects: Schema.Array(Schema.String),
})
export type GlobalConfig = typeof GlobalConfigSchema.Type

export const TsconfigSchema = Schema.StructWithRest(
  Schema.Struct({
    exclude: Schema.optional(Schema.Array(Schema.String)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
)
export type Tsconfig = typeof TsconfigSchema.Type
