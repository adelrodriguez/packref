export const SUPPORTED_REPOSITORY_PROVIDERS = [
  "bitbucket",
  "github",
  "gitlab",
  "sourcehut",
] as const
export type RepositoryProvider = (typeof SUPPORTED_REPOSITORY_PROVIDERS)[number]

export const REPOSITORY_PROVIDER_HOSTS = {
  bitbucket: "bitbucket.org",
  github: "github.com",
  gitlab: "gitlab.com",
  sourcehut: "git.sr.ht",
} satisfies Record<RepositoryProvider, string>

export const HOST_REPOSITORY_PROVIDERS = new Map<string, RepositoryProvider>(
  SUPPORTED_REPOSITORY_PROVIDERS.map((provider) => [REPOSITORY_PROVIDER_HOSTS[provider], provider])
)

export const checkIsRepositoryProvider = (value: string): value is RepositoryProvider =>
  SUPPORTED_REPOSITORY_PROVIDERS.some((provider) => provider === value)
