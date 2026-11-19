import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as SemVer from "effect/SemVer"
import * as SemVerRange from "effect/SemVerRange"
import type { NpmPackageMetadata } from "#lib/registries/npm/metadata.ts"
import { PackageVersionNotFoundError } from "#lib/core/errors.ts"
import { NpmRegistryClient } from "#lib/registries/npm/client.ts"
import { defineRegistry } from "#lib/registries/registry.ts"

/**
 * Parses an npm range. npm reads ranges with node-semver, which also accepts a `v` before a
 * version, build metadata, the `~>` operator, and an empty `||` alternative that matches any
 * version. Each of these becomes its strict SemVer form first.
 */
const parseNpmRange = (specifier: string) =>
  SemVerRange.parse(
    specifier
      .split("||")
      .map(
        (alternative) =>
          alternative
            .replaceAll("~>", "~")
            .replaceAll(/(?<=^|[\s=<>~^])v(?=\d)/gu, "")
            .replaceAll(/\+[\d.A-Za-z-]*/gu, "")
            .trim() || "*"
      )
      .join(" || ")
  )

export const resolveVersion = (metadata: NpmPackageMetadata, requestedSpecifier: string) => {
  if (requestedSpecifier === "latest") {
    return Option.fromNullishOr(metadata["dist-tags"].latest).pipe(
      Option.filter((latest) => metadata.versions[latest] !== undefined)
    )
  }

  // Like `semver.valid`, an exact version may start with `v`, such as `v18.3.1`.
  return Result.match(SemVer.parse(requestedSpecifier.replace(/^v/u, "")), {
    onFailure: () =>
      Result.getSuccess(parseNpmRange(requestedSpecifier)).pipe(
        Option.flatMap((range) =>
          SemVerRange.maxSatisfying(
            range,
            // The registry can publish a version that is not valid SemVer. A range never matches it.
            Arr.getSuccesses(Arr.map(Object.keys(metadata.versions), SemVer.parse))
          )
        ),
        Option.map(SemVer.format)
      ),
    // Like `semver.valid`, an exact version drops its build metadata, such as `+build.5`.
    onSuccess: (exactVersion) =>
      Option.some(SemVer.format(SemVer.withBuild(exactVersion, []))).pipe(
        Option.filter((version) => metadata.versions[version] !== undefined)
      ),
  })
}

export default defineRegistry({
  name: "npm",
  normalizeName: (name) => name,
  resolve: (spec) =>
    Effect.gen(function* () {
      const client = yield* NpmRegistryClient
      const metadata = yield* client.getPackageMetadata(spec.name)
      const requestedSpecifier = spec.specifier ?? "latest"
      const resolvedVersion = resolveVersion(metadata, requestedSpecifier)

      if (Option.isNone(resolvedVersion)) {
        return yield* new PackageVersionNotFoundError({
          packageName: spec.name,
          registry: spec.registry,
          specifier: requestedSpecifier,
        })
      }

      const version = resolvedVersion.value
      const versionMetadata = metadata.versions[version]

      if (versionMetadata === undefined) {
        return yield* new PackageVersionNotFoundError({
          packageName: spec.name,
          registry: spec.registry,
          specifier: requestedSpecifier,
        })
      }

      const repository = versionMetadata.repository ?? metadata.repository
      const normalizedRepository = Option.fromNullishOr(repository).pipe(
        Option.map(
          Match.type<string | Exclude<typeof repository, string | undefined>>().pipe(
            Match.when(Match.string, (url) => ({ url })),
            Match.orElse(({ directory, url }) => ({ directory, url }))
          )
        ),
        Option.getOrUndefined
      )

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
  tagCandidates: ({ name, version }) => [`v${version}`, version, `${name}@${version}`],
})
