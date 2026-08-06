import * as Schema from "effect/Schema"

export interface RepositorySourceCandidate {
  readonly directory?: string
  readonly url: string
}

export const RepositorySourceSchema = Schema.Struct({
  directory: Schema.optional(Schema.String),
  host: Schema.String,
  type: Schema.Literal("repository"),
  url: Schema.String,
})
export type RepositorySource = typeof RepositorySourceSchema.Type

export const TarballSourceSchema = Schema.Struct({
  type: Schema.Literal("tarball"),
  url: Schema.String,
})
export type TarballSource = typeof TarballSourceSchema.Type

export const PackageSourceSchema = Schema.Union([RepositorySourceSchema, TarballSourceSchema])
export type PackageSource = typeof PackageSourceSchema.Type
export const packageSourceEquivalence = Schema.toEquivalence(PackageSourceSchema)

export interface NormalizedRepositorySource extends RepositorySource {
  readonly fetchSource: string | undefined
}

export interface ResolvedRepositoryRef {
  readonly ref: string
  readonly source: NormalizedRepositorySource
}
