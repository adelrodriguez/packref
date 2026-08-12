import * as Equivalence from "effect/Equivalence"
import * as Order from "effect/Order"
import type { Registry } from "#lib/core/registry.ts"

export interface PackageCoordinates {
  readonly name: string
  readonly registry: string
}

export interface PackageIdentity extends PackageCoordinates {
  readonly version: string
}

export const packageCoordinatesEquivalence = Equivalence.Struct({
  name: Equivalence.String,
  registry: Equivalence.String,
})

export const packageCoordinatesOrder = Order.combineAll([
  Order.mapInput(Order.String, (coordinates: PackageCoordinates) => coordinates.registry),
  Order.mapInput(Order.String, (coordinates: PackageCoordinates) => coordinates.name),
])

export const packageIdentityEquivalence = Equivalence.combine(
  packageCoordinatesEquivalence,
  Equivalence.mapInput(Equivalence.String, (identity: PackageIdentity) => identity.version)
)

export const packageIdentityOrder = Order.combine(
  packageCoordinatesOrder,
  Order.mapInput(Order.String, (identity: PackageIdentity) => identity.version)
)

export interface RegistryPackageSpec {
  readonly _tag: "registry"
  readonly name: string
  readonly registry: Registry
  readonly specifier?: string
}

export const SUPPORTED_REPOSITORY_PROVIDERS = [
  "bitbucket",
  "github",
  "gitlab",
  "sourcehut",
] as const
export type RepositoryProvider = (typeof SUPPORTED_REPOSITORY_PROVIDERS)[number]

export interface RepositoryPackageSpec {
  readonly _tag: "repository"
  readonly name: string
  readonly registry: RepositoryProvider
  readonly repository: {
    readonly directory?: string
    readonly url: string
  }
  readonly specifier?: string
}

export type ParsedPackageSpec = RegistryPackageSpec | RepositoryPackageSpec

export const PACKAGE_DIRECTORY_NAME = "packages"

export const REPOSITORY_PROVIDER_HOSTS: Readonly<Record<RepositoryProvider, string>> = {
  bitbucket: "bitbucket.org",
  github: "github.com",
  gitlab: "gitlab.com",
  sourcehut: "git.sr.ht",
}
