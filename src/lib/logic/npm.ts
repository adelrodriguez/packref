import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import { maxSatisfying, valid } from "semver"
import type { NpmPackageMetadata } from "#lib/core/npm.ts"
import type { RegistryPackageSpec } from "#lib/core/packages.ts"
import type { ResolvedPackageReference } from "#lib/core/registry-adapter.ts"
import { PackageVersionNotFoundError } from "#lib/core/errors.ts"

export const resolveVersion = (metadata: NpmPackageMetadata, requestedSpecifier: string) => {
  if (requestedSpecifier === "latest") {
    return Option.fromNullishOr(metadata["dist-tags"].latest).pipe(
      Option.filter((latest) => metadata.versions[latest] !== undefined)
    )
  }

  return Match.value(valid(requestedSpecifier)).pipe(
    Match.when(Match.string, (exactVersion) =>
      Option.fromNullishOr(metadata.versions[exactVersion]).pipe(Option.as(exactVersion))
    ),
    Match.orElse(() =>
      Option.fromNullishOr(maxSatisfying(Object.keys(metadata.versions), requestedSpecifier))
    )
  )
}

export const resolveNpmPackage = Effect.fn("resolveNpmPackage")(function* (
  spec: RegistryPackageSpec,
  metadata: NpmPackageMetadata
): Effect.fn.Return<ResolvedPackageReference, PackageVersionNotFoundError> {
  const requestedSpecifier = spec.specifier ?? "latest"
  const resolvedVersion = resolveVersion(metadata, requestedSpecifier)

  if (Option.isNone(resolvedVersion)) {
    return yield* new PackageVersionNotFoundError({
      name: spec.name,
      registry: spec.registry,
      specifier: requestedSpecifier,
    })
  }

  const version = resolvedVersion.value
  const versionMetadata = metadata.versions[version]

  if (versionMetadata === undefined) {
    return yield* new PackageVersionNotFoundError({
      name: spec.name,
      registry: spec.registry,
      specifier: requestedSpecifier,
    })
  }

  const repository = versionMetadata.repository ?? metadata.repository

  return {
    identity: { name: spec.name, registry: spec.registry, version },
    repository:
      repository === undefined
        ? undefined
        : typeof repository === "string"
          ? { url: repository }
          : { directory: repository.directory, url: repository.url },
    tarballUrl: versionMetadata.dist.tarball,
  }
})
