import * as Schema from "effect/Schema"

export const NpmRepositoryObjectSchema = Schema.Struct({
  directory: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  url: Schema.String,
})

export const NpmRepositorySchema = Schema.Union([Schema.String, NpmRepositoryObjectSchema])
export type NpmRepository = typeof NpmRepositorySchema.Type

export const NpmPackageVersionMetadataSchema = Schema.Struct({
  repository: Schema.optional(NpmRepositorySchema),
  version: Schema.String,
})

export const NpmPackageMetadataSchema = Schema.Struct({
  "dist-tags": Schema.Struct({
    latest: Schema.optional(Schema.String),
  }),
  name: Schema.String,
  repository: Schema.optional(NpmRepositorySchema),
  versions: Schema.Record(Schema.String, NpmPackageVersionMetadataSchema),
})
export type NpmPackageMetadata = typeof NpmPackageMetadataSchema.Type

export const decodeNpmPackageMetadata = Schema.decodeUnknownEffect(NpmPackageMetadataSchema)
