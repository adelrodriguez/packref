import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Filter from "effect/Filter"
import { pipe } from "effect/Function"
import * as Result from "effect/Result"
import type { PackageIdentity } from "#lib/core/packages.ts"
import type { NormalizedRepositorySource } from "#lib/core/source.ts"
import { GitExecutableNotFoundError, NetworkError } from "#lib/core/errors.ts"
import { CommandRunner } from "#lib/services/command-runner.ts"

const TAGS_PREFIX = "refs/tags/"

export const parseGitRemoteTagsOutput = (output: string) =>
  pipe(
    output.split(/\r?\n/u),
    Array.filterMap((rawLine) => {
      const line = rawLine.trim()

      if (line.length === 0) {
        return Result.failVoid
      }

      const ref = line.split(/\s+/u).at(-1)

      if (ref === undefined || !ref.startsWith(TAGS_PREFIX)) {
        return Result.failVoid
      }

      const tag = ref.slice(TAGS_PREFIX.length).replace(/\^\{\}$/u, "")

      return tag.length > 0 ? Result.succeed(tag) : Result.failVoid
    }),
    Array.dedupe
  )

export const getTagCandidates = ({ name, version }: PackageIdentity) => [
  `v${version}`,
  version,
  `${name}@${version}`,
]

export const matchRepositoryTag = (identity: PackageIdentity, availableTags: readonly string[]) => {
  const availableTagSet = new Set(availableTags)

  return getTagCandidates(identity).find((candidate) => availableTagSet.has(candidate))
}

export const listRemoteTags = Effect.fn("listRemoteTags")(function* (
  source: NormalizedRepositorySource
) {
  const commandRunner = yield* CommandRunner
  const result = yield* commandRunner.run("git", ["ls-remote", "--tags", source.url]).pipe(
    Effect.catchFilter(
      Filter.reason("PlatformError", "NotFound"),
      (cause) => Effect.fail(new GitExecutableNotFoundError({ cause, command: "git" })),
      (cause) =>
        Effect.fail(
          new NetworkError({
            cause,
            url: source.url,
          })
        )
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
