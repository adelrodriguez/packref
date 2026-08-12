import * as Schema from "effect/Schema"

export const TsconfigSchema = Schema.StructWithRest(
  Schema.Struct({ exclude: Schema.optional(Schema.Array(Schema.String)) }),
  [Schema.Record(Schema.String, Schema.Unknown)]
)

export interface FileUpdatePlan<S extends string> {
  readonly content?: string
  readonly status: S
}

export type AgentsIntegrationResult = "malformed" | "updated"
export type TsconfigIntegrationResult = "malformed" | "missing" | "updated"
