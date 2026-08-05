import * as Schema from "effect/Schema"

export const NpmRepositoryObjectSchema = Schema.StructWithRest(
  Schema.Struct({
    directory: Schema.optional(Schema.String),
    type: Schema.optional(Schema.String),
    url: Schema.String,
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
)

export const NpmRepositorySchema = Schema.Union([Schema.String, NpmRepositoryObjectSchema])

export const NpmDistSchema = Schema.StructWithRest(
  Schema.Struct({
    tarball: Schema.String,
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
)

export const NpmPackageVersionMetadataSchema = Schema.StructWithRest(
  Schema.Struct({
    dist: NpmDistSchema,
    repository: Schema.optional(NpmRepositorySchema),
    version: Schema.String,
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
)

export const NpmPackageMetadataSchema = Schema.StructWithRest(
  Schema.Struct({
    "dist-tags": Schema.StructWithRest(
      Schema.Struct({
        latest: Schema.optional(Schema.String),
      }),
      [Schema.Record(Schema.String, Schema.Unknown)]
    ),
    name: Schema.String,
    repository: Schema.optional(NpmRepositorySchema),
    versions: Schema.Record(Schema.String, NpmPackageVersionMetadataSchema),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
)
export type NpmPackageMetadata = typeof NpmPackageMetadataSchema.Type

export const decodeNpmPackageMetadata = Schema.decodeUnknownEffect(NpmPackageMetadataSchema)
