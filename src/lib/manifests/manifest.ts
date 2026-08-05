import type * as Effect from "effect/Effect"
import type { Registry } from "#lib/core/registry.ts"

export const DEPENDENCY_GROUPS = ["dependencies", "devDependencies", "peerDependencies"] as const

export type DependencyGroup = (typeof DEPENDENCY_GROUPS)[number]

export interface ManifestDependency {
  readonly exactVersion?: string
  readonly group: DependencyGroup
  readonly name: string
  readonly registry: Registry
  readonly specifier: string
}

export interface ManifestAdapter<E = never, R = never> {
  readonly detect: (projectPath: string) => Effect.Effect<boolean, E, R>
  readonly name: string
  readonly read: (projectPath: string) => Effect.Effect<readonly ManifestDependency[], E, R>
}

export const defineManifest = <E, R>(adapter: ManifestAdapter<E, R>) => adapter
