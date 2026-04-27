import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { InvalidPackageIdentity } from "#lib/core/errors.ts"

export interface PackageIdentity {
  readonly name: string
  readonly registry: string
  readonly version: string
}

export const PACKAGE_DIRECTORY_NAME = "packages"

type PackageIdentityField = "name" | "registry" | "version"

const validatePathSegment = (field: PackageIdentityField, value: string) => {
  if (value.length === 0) {
    return Effect.fail(
      new InvalidPackageIdentity({
        field,
        reason: "must not be empty",
        value,
      })
    )
  }

  if (value === "." || value === "..") {
    return Effect.fail(
      new InvalidPackageIdentity({
        field,
        reason: "must not be a reserved path segment",
        value,
      })
    )
  }

  if (value.includes("/") || value.includes("\\")) {
    return Effect.fail(
      new InvalidPackageIdentity({
        field,
        reason: "must not contain path separators",
        value,
      })
    )
  }

  return Effect.void
}

export const getPackageIdentitySegments = ({ registry, name, version }: PackageIdentity) =>
  Effect.gen(function* () {
    yield* validatePathSegment("registry", registry)
    yield* validatePathSegment("version", version)

    if (name.startsWith("@")) {
      const nameSegments = name.split("/")

      if (nameSegments.length !== 2) {
        return yield* Effect.fail(
          new InvalidPackageIdentity({
            field: "name",
            reason: "scoped package names must contain exactly one scope separator",
            value: name,
          })
        )
      }

      const [scope = "", packageName = ""] = nameSegments

      if (scope === "@") {
        return yield* Effect.fail(
          new InvalidPackageIdentity({
            field: "name",
            reason: "scoped package names must include a non-empty scope",
            value: name,
          })
        )
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

export const getStorePackagePath = (storeRoot: string, identity: PackageIdentity) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const segments = yield* getPackageIdentitySegments(identity)

    return path.join(storeRoot, ...segments)
  })
