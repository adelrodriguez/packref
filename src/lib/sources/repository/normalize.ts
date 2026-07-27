import * as Effect from "effect/Effect"
import type { PackageIdentity } from "#lib/core/packages.ts"
import type {
  NormalizedRepositorySource,
  RepositorySourceCandidate,
  ResolvedRepositoryRef,
} from "#lib/core/source.ts"
import type { CommandRunner } from "#lib/services/command-runner.ts"
import { InvalidRepositoryUrlError, TagNotFoundError, type NetworkError } from "#lib/core/errors.ts"
import { listRemoteTags, matchRepositoryTag } from "#lib/sources/repository/tags.ts"

const SHORTHAND_PROVIDERS = {
  bitbucket: "bitbucket.org",
  github: "github.com",
  gitlab: "gitlab.com",
} as const

type KnownProvider = keyof typeof SHORTHAND_PROVIDERS

const FETCH_SOURCE_PROVIDERS = new Map<string, KnownProvider>([
  ["bitbucket.org", "bitbucket"],
  ["github.com", "github"],
  ["gitlab.com", "gitlab"],
])

const cleanRepositoryPath = (repositoryPath: string) =>
  repositoryPath
    .replace(/\/+$/, "")
    .replace(/\.git$/u, "")
    .replace(/^\/+/u, "")

const getProviderFetchSource = (host: string, repositoryPath: string) => {
  const provider = FETCH_SOURCE_PROVIDERS.get(host)

  return provider === undefined ? undefined : `${provider}:${repositoryPath}`
}

const normalizeFromStandardUrl = (
  candidate: RepositorySourceCandidate,
  rawUrl: string
): Effect.Effect<NormalizedRepositorySource, InvalidRepositoryUrlError> =>
  Effect.gen(function* () {
    const parsedUrl = yield* Effect.try({
      catch: (cause) =>
        new InvalidRepositoryUrlError({
          reason: `failed to parse URL (${String(cause)})`,
          url: candidate.url,
        }),
      try: () => new URL(rawUrl),
    })
    const repositoryPath = cleanRepositoryPath(parsedUrl.pathname)

    if (repositoryPath.length === 0) {
      return yield* new InvalidRepositoryUrlError({
        reason: "repository path must not be empty",
        url: candidate.url,
      })
    }

    const host = parsedUrl.host.toLowerCase()
    const url = `https://${host}/${repositoryPath}`

    return {
      directory: candidate.directory,
      fetchSource: getProviderFetchSource(host, repositoryPath) ?? url,
      host,
      type: "repository",
      url,
    } satisfies NormalizedRepositorySource
  })

const normalizeFromScpLikeUrl = (
  candidate: RepositorySourceCandidate,
  rawUrl: string
): Effect.Effect<NormalizedRepositorySource, InvalidRepositoryUrlError> => {
  const match = /^(?:[^@]+@)?(?<host>[^:]+):(?<repositoryPath>.+)$/u.exec(rawUrl)

  if (match?.groups === undefined) {
    return Effect.fail(
      new InvalidRepositoryUrlError({
        reason: "unsupported repository URL format",
        url: candidate.url,
      })
    )
  }

  const { host: rawHost, repositoryPath: rawRepositoryPath } = match.groups

  if (rawHost === undefined || rawRepositoryPath === undefined) {
    return Effect.fail(
      new InvalidRepositoryUrlError({
        reason: "unsupported repository URL format",
        url: candidate.url,
      })
    )
  }

  const host = rawHost.toLowerCase()
  const repositoryPath = cleanRepositoryPath(rawRepositoryPath)

  if (repositoryPath.length === 0) {
    return Effect.fail(
      new InvalidRepositoryUrlError({
        reason: "repository path must not be empty",
        url: candidate.url,
      })
    )
  }

  const url = `https://${host}/${repositoryPath}`

  return Effect.succeed({
    directory: candidate.directory,
    fetchSource: getProviderFetchSource(host, repositoryPath) ?? url,
    host,
    type: "repository",
    url,
  } satisfies NormalizedRepositorySource)
}

const normalizeFromShorthandUrl = (
  candidate: RepositorySourceCandidate,
  provider: keyof typeof SHORTHAND_PROVIDERS,
  repositoryPath: string
): Effect.Effect<NormalizedRepositorySource, InvalidRepositoryUrlError> => {
  const cleanedRepositoryPath = cleanRepositoryPath(repositoryPath)

  if (cleanedRepositoryPath.length === 0) {
    return Effect.fail(
      new InvalidRepositoryUrlError({
        reason: "repository path must not be empty",
        url: candidate.url,
      })
    )
  }

  const host = SHORTHAND_PROVIDERS[provider]
  const url = `https://${host}/${cleanedRepositoryPath}`

  return Effect.succeed({
    directory: candidate.directory,
    fetchSource: `${provider}:${cleanedRepositoryPath}`,
    host,
    type: "repository",
    url,
  } satisfies NormalizedRepositorySource)
}

export const normalizeRepositorySource = (
  candidate: RepositorySourceCandidate
): Effect.Effect<NormalizedRepositorySource, InvalidRepositoryUrlError> => {
  const trimmedUrl = candidate.url.trim()
  const withoutGitPrefix = trimmedUrl.replace(/^git\+/u, "")
  const shorthandMatch = /^(?<provider>github|gitlab|bitbucket):(?<repositoryPath>.+)$/u.exec(
    withoutGitPrefix
  )

  if (shorthandMatch?.groups !== undefined) {
    const provider = shorthandMatch.groups.provider
    const repositoryPath = shorthandMatch.groups.repositoryPath

    if (provider === undefined || repositoryPath === undefined) {
      return Effect.fail(
        new InvalidRepositoryUrlError({
          reason: "unsupported repository URL format",
          url: candidate.url,
        })
      )
    }

    return normalizeFromShorthandUrl(candidate, provider as KnownProvider, repositoryPath)
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(withoutGitPrefix)) {
    return normalizeFromStandardUrl(candidate, withoutGitPrefix)
  }

  return normalizeFromScpLikeUrl(candidate, withoutGitPrefix)
}

export const resolveRepositoryRef = (
  identity: PackageIdentity,
  candidate: RepositorySourceCandidate
): Effect.Effect<
  ResolvedRepositoryRef,
  InvalidRepositoryUrlError | NetworkError | TagNotFoundError,
  CommandRunner
> =>
  Effect.gen(function* () {
    const source = yield* normalizeRepositorySource(candidate)
    const tags = yield* listRemoteTags(source)
    const ref = matchRepositoryTag(identity, tags)

    if (ref === undefined) {
      return yield* new TagNotFoundError({
        repository: source.url,
        version: identity.version,
      })
    }

    return {
      ref,
      source,
    } satisfies ResolvedRepositoryRef
  })
