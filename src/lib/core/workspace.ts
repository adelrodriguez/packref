import * as Schema from "effect/Schema"
import { PackageSourceSchema } from "#lib/core/source.ts"

export const GlobalConfigSchema = Schema.Struct({ projects: Schema.Array(Schema.String) })
export type GlobalConfig = typeof GlobalConfigSchema.Type

export const PackageEntrySchema = Schema.Struct({
  name: Schema.String,
  registry: Schema.String,
  source: PackageSourceSchema,
  tracking: Schema.Union([Schema.Literal("manual"), Schema.Literal("dependency")]),
  version: Schema.String,
})
export type PackageEntry = typeof PackageEntrySchema.Type

export const LockfileSchema = Schema.Struct({ packages: Schema.Array(PackageEntrySchema) })
export type Lockfile = typeof LockfileSchema.Type

export const emptyGlobalConfig: GlobalConfig = Object.freeze({ projects: Object.freeze([]) })
export const emptyLockfile: Lockfile = Object.freeze({ packages: Object.freeze([]) })
