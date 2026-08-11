import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
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
import { matchRepositoryTag, RemoteTagReader } from "#lib/sources/repository/tags.ts"

const KNOWN_PROVIDERS = ["bitbucket", "github", "gitlab", "sourcehut"] as const

type KnownProvider = (typeof KNOWN_PROVIDERS)[number]

const PROVIDER_HOSTS: Record<KnownProvider, string> = {
  bitbucket: "bitbucket.org",
  github: "github.com",
  gitlab: "gitlab.com",
  sourcehut: "git.sr.ht",
}

const HOST_PROVIDERS = new Map<string, KnownProvider>(
  KNOWN_PROVIDERS.map((provider) => [PROVIDER_HOSTS[provider], provider])
)

const DEFAULT_SHORTHAND_PROVIDER = "github" satisfies KnownProvider
const SHORTHAND_PATTERN = new RegExp(
  `^(?<provider>${KNOWN_PROVIDERS.join("|")}):(?<repositoryPath>.+)$`,
  "u"
)

const checkIsKnownProvider = (value: string): value is KnownProvider =>
  KNOWN_PROVIDERS.some((provider) => provider === value)

const cleanRepositoryPath = (repositoryPath: string) =>
  repositoryPath
    .replace(/\/+$/u, "")
    .replace(/\.git$/u, "")
    .replace(/^\/+/u, "")

const invalidRepositoryUrl = (candidate: RepositorySourceCandidate, reason: string) =>
  new InvalidRepositoryUrlError({ reason, url: candidate.url })

const makeNormalizedSource = (
  candidate: RepositorySourceCandidate,
  host: string,
  rawRepositoryPath: string
): Effect.Effect<NormalizedRepositorySource, InvalidRepositoryUrlError> => {
  const repositoryPath = cleanRepositoryPath(rawRepositoryPath)

  if (repositoryPath.length === 0) {
    return Effect.fail(invalidRepositoryUrl(candidate, "repository path must not be empty"))
  }

  const provider = HOST_PROVIDERS.get(host)
  const fetchRepositoryPath =
    provider === "sourcehut" ? repositoryPath.replace(/^~/u, "") : repositoryPath

  return Effect.succeed({
    ...(candidate.directory === undefined ? {} : { directory: candidate.directory }),
    fetchSource: provider === undefined ? undefined : `${provider}:${fetchRepositoryPath}`,
    host,
    type: "repository",
    url: `https://${host}/${repositoryPath}`,
  } satisfies NormalizedRepositorySource)
}

const normalizeFromShorthandUrl = (
  candidate: RepositorySourceCandidate,
  provider: KnownProvider,
  repositoryPath: string
) => {
  const barePath = cleanRepositoryPath(repositoryPath).replace(/^~/u, "")

  if (barePath.length === 0) {
    return Effect.fail(invalidRepositoryUrl(candidate, "repository path must not be empty"))
  }

  return makeNormalizedSource(
    candidate,
    PROVIDER_HOSTS[provider],
    provider === "sourcehut" ? `~${barePath}` : barePath
  )
}

const normalizeFromStandardUrl = (candidate: RepositorySourceCandidate, rawUrl: string) =>
  Effect.try({
    catch: (cause) => invalidRepositoryUrl(candidate, `failed to parse URL (${String(cause)})`),
    try: () => new URL(rawUrl),
  }).pipe(
    Effect.flatMap((parsedUrl) =>
      makeNormalizedSource(candidate, parsedUrl.host.toLowerCase(), parsedUrl.pathname)
    )
  )

const normalizeFromScpLikeUrl = (candidate: RepositorySourceCandidate, rawUrl: string) => {
  const groups = Option.fromNullishOr(
    /^(?:[^@]+@)?(?<host>[^:]+):(?<repositoryPath>.+)$/u.exec(rawUrl)
  ).pipe(Option.flatMap((match) => Option.fromNullishOr(match.groups)))
  const host = Option.getOrUndefined(groups)?.host
  const repositoryPath = Option.getOrUndefined(groups)?.repositoryPath

  if (host === undefined || repositoryPath === undefined) {
    return Effect.fail(invalidRepositoryUrl(candidate, "unsupported repository URL format"))
  }

  return makeNormalizedSource(candidate, host.toLowerCase(), repositoryPath)
}

export const normalizeRepositorySource = Effect.fn("normalizeRepositorySource")((
  candidate: RepositorySourceCandidate
) => {
  const url = candidate.url.trim().replace(/^git\+/u, "")
  const shorthandGroups = Option.fromNullishOr(SHORTHAND_PATTERN.exec(url)).pipe(
    Option.flatMap((match) => Option.fromNullishOr(match.groups))
  )
  const provider = Option.getOrUndefined(shorthandGroups)?.provider
  const shorthandPath = Option.getOrUndefined(shorthandGroups)?.repositoryPath

  if (provider !== undefined && shorthandPath !== undefined && checkIsKnownProvider(provider)) {
    return normalizeFromShorthandUrl(candidate, provider, shorthandPath)
  }

  if (/^[^/:\s]+\/[^/:\s]+$/u.test(url)) {
    return normalizeFromShorthandUrl(candidate, DEFAULT_SHORTHAND_PROVIDER, url)
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(url)) {
    return normalizeFromStandardUrl(candidate, url)
  }

  return normalizeFromScpLikeUrl(candidate, url)
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

  const remoteTagReader = yield* RemoteTagReader
  const tags = yield* remoteTagReader.list(source)
  const ref = matchRepositoryTag(identity, tags)

  if (Option.isNone(ref)) {
    return yield* new TagNotFoundError({
      repository: source.url,
      version: identity.version,
    })
  }

  return {
    ref: ref.value,
    source,
  } satisfies ResolvedRepositoryRef
})
