import * as Equivalence from "effect/Equivalence"
import * as Order from "effect/Order"

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

export const formatPackageIdentity = (identity: PackageIdentity) =>
  `${identity.registry}:${identity.name}@${identity.version}`
