import * as Effect from "effect/Effect"
import type { PackageIdentity } from "#lib/core/packages.ts"
import type { NormalizedRepositorySource } from "#lib/core/source.ts"
import { NetworkError } from "#lib/core/errors.ts"
import { CommandRunner } from "#lib/services/command-runner.ts"

const TAGS_PREFIX = "refs/tags/"

export const parseGitRemoteTagsOutput = (output: string) => {
  const tags = new Set<string>()

  for (const rawLine of output.split(/\r?\n/u)) {
    const line = rawLine.trim()

    if (line.length === 0) {
      continue
    }

    const ref = line.split(/\s+/u).at(-1)

    if (ref === undefined || !ref.startsWith(TAGS_PREFIX)) {
      continue
    }

    const tag = ref.slice(TAGS_PREFIX.length).replace(/\^\{\}$/u, "")

    if (tag.length > 0) {
      tags.add(tag)
    }
  }

  return [...tags]
}

export const getTagCandidates = ({ name, version }: PackageIdentity) => [
  `v${version}`,
  version,
  `${name}@${version}`,
]

export const matchRepositoryTag = (identity: PackageIdentity, availableTags: readonly string[]) => {
  const availableTagSet = new Set(availableTags)

  return getTagCandidates(identity).find((candidate) => availableTagSet.has(candidate))
}

export const listRemoteTags = (
  source: NormalizedRepositorySource
): Effect.Effect<readonly string[], NetworkError, CommandRunner> =>
  Effect.gen(function* () {
    const commandRunner = yield* CommandRunner
    const result = yield* commandRunner.run("git", ["ls-remote", "--tags", source.url]).pipe(
      Effect.mapError(
        (cause) =>
          new NetworkError({
            cause,
            url: source.url,
          })
      )
    )

    if (result.exitCode !== 0) {
      return yield* new NetworkError({
        cause:
          result.stderr.length > 0
            ? result.stderr
            : `git ls-remote exited with code ${result.exitCode}`,
        url: source.url,
      })
    }

    return parseGitRemoteTagsOutput(result.stdout)
  })
