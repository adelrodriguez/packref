import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { InvalidPackageIdentity, UnsupportedRegistryError } from "#lib/core/errors.ts"
import { DEFAULT_REGISTRY, checkIsRegistry, type Registry } from "#lib/core/registry.ts"

export interface PackageIdentity {
  readonly name: string
  readonly registry: string
  readonly version: string
}

export interface ParsedPackageSpec {
  readonly name: string
  readonly registry: Registry
  readonly specifier?: string
}

export const PACKAGE_DIRECTORY_NAME = "packages"

type PackageIdentityField = "name" | "registry" | "version"

const validatePathSegment = (field: PackageIdentityField, value: string) => {
  if (value.length === 0) {
    return new InvalidPackageIdentity({
      field,
      reason: "must not be empty",
      value,
    })
  }

  if (value === "." || value === "..") {
    return new InvalidPackageIdentity({
      field,
      reason: "must not be a reserved path segment",
      value,
    })
  }

  if (value.includes("/") || value.includes("\\")) {
    return new InvalidPackageIdentity({
      field,
      reason: "must not contain path separators",
      value,
    })
  }

  return Effect.void
}

const checkHasRegistryPrefix = (value: string) => {
  const prefixSeparatorIndex = value.indexOf(":")

  if (prefixSeparatorIndex === -1) {
    return false
  }

  const firstPathSeparatorIndex = value.indexOf("/")

  return firstPathSeparatorIndex === -1 || prefixSeparatorIndex < firstPathSeparatorIndex
}

export const getPackageIdentitySegments = ({ registry, name, version }: PackageIdentity) =>
  Effect.gen(function* () {
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

export const getPackageIdentityPath = (identity: PackageIdentity) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const segments = yield* getPackageIdentitySegments(identity)

    return path.join(...segments)
  })

export const parsePackageSpec = (input: string) =>
  Effect.gen(function* () {
    const rawSpec = input.trim()

    let spec = rawSpec
    let registry: Registry = DEFAULT_REGISTRY

    if (checkHasRegistryPrefix(rawSpec)) {
      const [rawRegistry = "", ...rest] = rawSpec.split(":")
      const packageSpec = rest.join(":")

      if (!checkIsRegistry(rawRegistry)) {
        return yield* new UnsupportedRegistryError({ registry: rawRegistry })
      }

      registry = rawRegistry
      spec = packageSpec
    }

    if (spec.startsWith("@")) {
      const versionSeparatorIndex = spec.lastIndexOf("@")

      if (versionSeparatorIndex <= 0) {
        return {
          name: spec,
          registry,
        } satisfies ParsedPackageSpec
      }

      return {
        name: spec.slice(0, versionSeparatorIndex),
        registry,
        specifier: spec.slice(versionSeparatorIndex + 1),
      } satisfies ParsedPackageSpec
    }

    const versionSeparatorIndex = spec.indexOf("@")

    if (versionSeparatorIndex === -1) {
      return {
        name: spec,
        registry,
      } satisfies ParsedPackageSpec
    }

    return {
      name: spec.slice(0, versionSeparatorIndex),
      registry,
      specifier: spec.slice(versionSeparatorIndex + 1),
    } satisfies ParsedPackageSpec
  })
