import * as Effect from "effect/Effect"
import type { PackageIdentity } from "#lib/core/packages.ts"
import type {
  NormalizedRepositorySource,
  RepositorySourceCandidate,
  ResolvedRepositoryRef,
} from "#lib/core/source.ts"
import {
  InvalidRepositoryUrlError,
  TagNotFoundError,
  UnsupportedRepositoryHostError,
} from "#lib/core/errors.ts"
import { listRemoteTags, matchRepositoryTag } from "#lib/sources/repository/tags.ts"

const SHORTHAND_PROVIDERS = {
  bitbucket: "bitbucket.org",
  github: "github.com",
  gitlab: "gitlab.com",
  sourcehut: "git.sr.ht",
} as const

type KnownProvider = keyof typeof SHORTHAND_PROVIDERS

const DEFAULT_SHORTHAND_PROVIDER = "github" satisfies KnownProvider
const SHORTHAND_PATTERN = new RegExp(
  `^(?<provider>${Object.keys(SHORTHAND_PROVIDERS).join("|")}):(?<repositoryPath>.+)$`,
  "u"
)

const FETCH_SOURCE_PROVIDERS = new Map<string, KnownProvider>([
  ["bitbucket.org", "bitbucket"],
  ["github.com", "github"],
  ["gitlab.com", "gitlab"],
  ["git.sr.ht", "sourcehut"],
])

const checkIsKnownProvider = (value: string): value is KnownProvider =>
  Object.hasOwn(SHORTHAND_PROVIDERS, value)

const cleanRepositoryPath = (repositoryPath: string) =>
  repositoryPath
    .replace(/\/+$/, "")
    .replace(/\.git$/u, "")
    .replace(/^\/+/u, "")

const getProviderFetchSource = (host: string, repositoryPath: string) => {
  const provider = FETCH_SOURCE_PROVIDERS.get(host)

  if (provider === undefined) {
    return
  }

  const fetchRepositoryPath =
    provider === "sourcehut" ? repositoryPath.replace(/^~/u, "") : repositoryPath

  return `${provider}:${fetchRepositoryPath}`
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
      fetchSource: getProviderFetchSource(host, repositoryPath),
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
    fetchSource: getProviderFetchSource(host, repositoryPath),
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
  const fetchRepositoryPath =
    provider === "sourcehut" ? cleanedRepositoryPath.replace(/^~/u, "") : cleanedRepositoryPath

  if (fetchRepositoryPath.length === 0) {
    return Effect.fail(
      new InvalidRepositoryUrlError({
        reason: "repository path must not be empty",
        url: candidate.url,
      })
    )
  }

  const host = SHORTHAND_PROVIDERS[provider]
  const urlRepositoryPath =
    provider === "sourcehut" ? `~${fetchRepositoryPath}` : fetchRepositoryPath
  const url = `https://${host}/${urlRepositoryPath}`

  return Effect.succeed({
    directory: candidate.directory,
    fetchSource: `${provider}:${fetchRepositoryPath}`,
    host,
    type: "repository",
    url,
  } satisfies NormalizedRepositorySource)
}

export const normalizeRepositorySource = Effect.fn("normalizeRepositorySource")((
  candidate: RepositorySourceCandidate
) => {
  const trimmedUrl = candidate.url.trim()
  const withoutGitPrefix = trimmedUrl.replace(/^git\+/u, "")
  const shorthandMatch = SHORTHAND_PATTERN.exec(withoutGitPrefix)
  const bareShorthandMatch = /^(?<repositoryPath>[^/:\s]+\/[^/:\s]+)$/u.exec(withoutGitPrefix)

  if (shorthandMatch?.groups !== undefined) {
    const provider = shorthandMatch.groups.provider
    const repositoryPath = shorthandMatch.groups.repositoryPath

    if (provider === undefined || repositoryPath === undefined || !checkIsKnownProvider(provider)) {
      return Effect.fail(
        new InvalidRepositoryUrlError({
          reason: "unsupported repository URL format",
          url: candidate.url,
        })
      )
    }

    return normalizeFromShorthandUrl(candidate, provider, repositoryPath)
  }

  if (bareShorthandMatch?.groups?.repositoryPath !== undefined) {
    return normalizeFromShorthandUrl(
      candidate,
      DEFAULT_SHORTHAND_PROVIDER,
      bareShorthandMatch.groups.repositoryPath
    )
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(withoutGitPrefix)) {
    return normalizeFromStandardUrl(candidate, withoutGitPrefix)
  }

  return normalizeFromScpLikeUrl(candidate, withoutGitPrefix)
})

export const resolveRepositoryRef = Effect.fn("resolveRepositoryRef")(function* (
  identity: PackageIdentity,
  candidate: RepositorySourceCandidate
) {
  const source = yield* normalizeRepositorySource(candidate)

  if (source.fetchSource === undefined) {
    return yield* new UnsupportedRepositoryHostError({
      host: source.host,
      url: source.url,
    })
  }

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
