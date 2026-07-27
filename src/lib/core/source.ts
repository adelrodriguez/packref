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

export interface NormalizedRepositorySource extends RepositorySource {
  readonly fetchSource: string
}

export interface ResolvedRepositoryRef {
  readonly ref: string
  readonly source: NormalizedRepositorySource
}
