import * as Effect from "effect/Effect"
import * as Equivalence from "effect/Equivalence"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import { InvalidPackageIdentity, UnsupportedRegistryError } from "#lib/core/errors.ts"
import { DEFAULT_REGISTRY, checkIsRegistry, type Registry } from "#lib/core/registry.ts"

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

export interface ParsedPackageSpec {
  readonly name: string
  readonly registry: Registry
  readonly specifier?: string
}

export const PACKAGE_DIRECTORY_NAME = "packages"

type PackageIdentityField = "name" | "registry" | "version"

const validatePathSegment = Effect.fn("validatePathSegment")(function* (
  field: PackageIdentityField,
  value: string
): Effect.fn.Return<void, InvalidPackageIdentity> {
  if (value.length === 0) {
    return yield* new InvalidPackageIdentity({
      field,
      reason: "must not be empty",
      value,
    })
  }

  if (value === "." || value === "..") {
    return yield* new InvalidPackageIdentity({
      field,
      reason: "must not be a reserved path segment",
      value,
    })
  }

  if (value.includes("/") || value.includes("\\")) {
    return yield* new InvalidPackageIdentity({
      field,
      reason: "must not contain path separators",
      value,
    })
  }
})

const checkHasRegistryPrefix = (value: string) => {
  const prefixSeparatorIndex = value.indexOf(":")

  if (prefixSeparatorIndex === -1) {
    return false
  }

  const firstPathSeparatorIndex = value.indexOf("/")

  return firstPathSeparatorIndex === -1 || prefixSeparatorIndex < firstPathSeparatorIndex
}

export const getPackageIdentitySegments = Effect.fn("getPackageIdentitySegments")(function* ({
  registry,
  name,
  version,
}: PackageIdentity) {
  yield* validatePathSegment("registry", registry)
  yield* validatePathSegment("version", version)

  if (name.startsWith("@")) {
    const nameSegments = name.split("/")

    if (nameSegments.length !== 2) {
      return yield* new InvalidPackageIdentity({
        field: "name",
        reason: "scoped package names must contain exactly one scope separator",
        value: name,
      })
    }

    const [scope = "", packageName = ""] = nameSegments

    if (scope === "@") {
      return yield* new InvalidPackageIdentity({
        field: "name",
        reason: "scoped package names must include a non-empty scope",
        value: name,
      })
    }

    yield* validatePathSegment("name", scope)
    yield* validatePathSegment("name", packageName)

    return [PACKAGE_DIRECTORY_NAME, registry, scope, packageName, version]
  }

  yield* validatePathSegment("name", name)

  return [PACKAGE_DIRECTORY_NAME, registry, name, version]
})

export const getPackageIdentityPath = Effect.fn("getPackageIdentityPath")(function* (
  identity: PackageIdentity
) {
  const path = yield* Path.Path
  const segments = yield* getPackageIdentitySegments(identity)

  return path.join(...segments)
})

export const parsePackageSpec = Effect.fn("parsePackageSpec")(function* (input: string) {
  const rawSpec = input.trim()

  let spec = rawSpec
  let registry: Registry = DEFAULT_REGISTRY

  if (checkHasRegistryPrefix(rawSpec)) {
    const [rawRegistry = "", ...rest] = rawSpec.split(":")
    const packageSpec = rest.join(":").trim()

    if (!checkIsRegistry(rawRegistry)) {
      return yield* new UnsupportedRegistryError({ registry: rawRegistry })
    }

    registry = rawRegistry
    spec = packageSpec
  }

  if (spec.length === 0) {
    return yield* new InvalidPackageIdentity({
      field: "name",
      reason: "must not be empty",
      value: spec,
    })
  }

  if (spec.startsWith("@")) {
    const versionSeparatorIndex = spec.lastIndexOf("@")

    if (versionSeparatorIndex <= 0) {
      return {
        name: spec,
        registry,
      } satisfies ParsedPackageSpec
    }

    const specifier = spec.slice(versionSeparatorIndex + 1)

    return {
      name: spec.slice(0, versionSeparatorIndex),
      registry,
      ...(specifier.length === 0 ? {} : { specifier }),
    } satisfies ParsedPackageSpec
  }

  const versionSeparatorIndex = spec.indexOf("@")

  if (versionSeparatorIndex === -1) {
    return {
      name: spec,
      registry,
    } satisfies ParsedPackageSpec
  }

  const specifier = spec.slice(versionSeparatorIndex + 1)

  return {
    name: spec.slice(0, versionSeparatorIndex),
    registry,
    ...(specifier.length === 0 ? {} : { specifier }),
  } satisfies ParsedPackageSpec
})
