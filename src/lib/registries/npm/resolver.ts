import * as Effect from "effect/Effect"
import { maxSatisfying, valid } from "semver"
import type { NpmPackageMetadata } from "#lib/registries/npm/metadata.ts"
import { PackageVersionNotFoundError } from "#lib/core/errors.ts"
import { NpmRegistryClient } from "#lib/registries/npm/client.ts"
import { defineRegistry } from "#lib/registries/registry.ts"

export const resolveVersion = (
  metadata: NpmPackageMetadata,
  requestedSpecifier: string
): string | undefined => {
  if (requestedSpecifier === "latest") {
    const latest = metadata["dist-tags"].latest

    return latest !== undefined && metadata.versions[latest] !== undefined ? latest : undefined
  }

  const exactVersion = valid(requestedSpecifier)

  if (exactVersion !== null) {
    return metadata.versions[exactVersion] === undefined ? undefined : exactVersion
  }

  return maxSatisfying(Object.keys(metadata.versions), requestedSpecifier) ?? undefined
}

export default defineRegistry({
  name: "npm",
  resolve: (spec) =>
    Effect.gen(function* () {
      const client = yield* NpmRegistryClient
      const metadata = yield* client.getPackageMetadata(spec.name)
      const requestedSpecifier = spec.specifier ?? "latest"
      const version = resolveVersion(metadata, requestedSpecifier)

      if (version === undefined) {
        return yield* new PackageVersionNotFoundError({
          name: spec.name,
          registry: spec.registry,
          specifier: requestedSpecifier,
        })
      }

      const versionMetadata = metadata.versions[version]

      if (versionMetadata === undefined) {
        return yield* new PackageVersionNotFoundError({
          name: spec.name,
          registry: spec.registry,
          specifier: requestedSpecifier,
        })
      }

      const repository = versionMetadata.repository ?? metadata.repository
      const normalizedRepository =
        repository === undefined
          ? undefined
          : typeof repository === "string"
            ? {
                url: repository,
              }
            : {
                directory: repository.directory,
                url: repository.url,
              }

      return {
        identity: {
          name: spec.name,
          registry: spec.registry,
          version,
        },
        repository: normalizedRepository,
        tarballUrl: versionMetadata.dist.tarball,
      }
    }),
})
