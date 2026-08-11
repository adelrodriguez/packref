import type * as PlatformError from "effect/PlatformError"
import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Filter from "effect/Filter"
import { pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Result from "effect/Result"
import * as Schedule from "effect/Schedule"
import * as Stream from "effect/Stream"
import * as ChildProcess from "effect/unstable/process/ChildProcess"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import type { PackageIdentity } from "#lib/core/packages.ts"
import type { NormalizedRepositorySource } from "#lib/core/source.ts"
import { GitExecutableNotFoundError, NetworkError } from "#lib/core/errors.ts"

const HEADS_PREFIX = "refs/heads/"
const TAGS_PREFIX = "refs/tags/"
const TRANSIENT_GIT_FAILURE_PATTERN =
  /could not resolve host|connection (?:refused|reset|timed out)|failed to connect|remote end hung up unexpectedly|service unavailable|temporary failure|the requested url returned error: 5\d\d/iu
const REMOTE_TAG_COMMAND_TIMEOUT = "30 seconds"
const REMOTE_TAG_RETRY_SCHEDULE = Schedule.exponential("10 millis").pipe(
  Schedule.upTo({ times: 2 })
)

interface RemoteTagCommandResult {
  readonly exitCode: number
  readonly stderr: string
  readonly stdout: string
}

type RemoteTagCommand = (
  source: NormalizedRepositorySource
) => Effect.Effect<RemoteTagCommandResult, PlatformError.PlatformError>

export interface RemoteRepositoryRefs {
  readonly head: string | undefined
  readonly heads: ReadonlyMap<string, string>
  readonly tags: ReadonlyMap<string, string>
}

interface RemoteTagReaderService {
  readonly list: (
    source: NormalizedRepositorySource
  ) => Effect.Effect<readonly string[], GitExecutableNotFoundError | NetworkError>
  readonly listRefs: (
    source: NormalizedRepositorySource
  ) => Effect.Effect<RemoteRepositoryRefs, GitExecutableNotFoundError | NetworkError>
}

export const parseGitRemoteRefsOutput = (output: string): RemoteRepositoryRefs => {
  let head: string | undefined
  const heads = new Map<string, string>()
  const tags = new Map<string, string>()

  for (const rawLine of output.split(/\r?\n/u)) {
    const [sha, ref] = rawLine.trim().split(/\s+/u)

    if (sha === undefined || ref === undefined) continue
    if (ref === "HEAD") head = sha
    else if (ref.startsWith(HEADS_PREFIX)) heads.set(ref.slice(HEADS_PREFIX.length), sha)
    else if (ref.startsWith(TAGS_PREFIX)) {
      const tag = ref.slice(TAGS_PREFIX.length).replace(/\^\{\}$/u, "")
      tags.set(tag, sha)
    }
  }

  return { head, heads, tags }
}

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

const makeRemoteTagReader = (runCommand: RemoteTagCommand) => {
  const read = Effect.fn("RemoteTagReader.read")(function* (source: NormalizedRepositorySource) {
    const result = yield* runCommand(source).pipe(
      Effect.timeout(REMOTE_TAG_COMMAND_TIMEOUT),
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
      ),
      Effect.flatMap((result) =>
        result.exitCode === 0
          ? Effect.succeed(result)
          : Effect.fail(
              new NetworkError({
                cause:
                  result.stderr.length > 0
                    ? result.stderr
                    : `git ls-remote exited with code ${result.exitCode}`,
                url: source.url,
              })
            )
      ),
      Effect.retry({
        schedule: REMOTE_TAG_RETRY_SCHEDULE,
        while: (error) =>
          Predicate.isTagged(error, "NetworkError") &&
          (!Predicate.isString(error.cause) || TRANSIENT_GIT_FAILURE_PATTERN.test(error.cause)),
      })
    )

    return result.stdout
  })

  return {
    list: Effect.fn("RemoteTagReader.list")(function* (source) {
      return parseGitRemoteTagsOutput(yield* read(source))
    }),
    listRefs: Effect.fn("RemoteTagReader.listRefs")(function* (source) {
      return parseGitRemoteRefsOutput(yield* read(source))
    }),
  } satisfies RemoteTagReaderService
}

export class RemoteTagReader extends Context.Service<RemoteTagReader, RemoteTagReaderService>()(
  "RemoteTagReader"
) {
  static readonly layerWithCommand = (runCommand: RemoteTagCommand) =>
    Layer.succeed(this)(makeRemoteTagReader(runCommand))

  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const childProcessSpawner = yield* ChildProcessSpawner

      return makeRemoteTagReader((source) =>
        Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* childProcessSpawner.spawn(
              ChildProcess.make(
                "git",
                ["ls-remote", source.url, "HEAD", "refs/heads/*", "refs/tags/*"],
                {
                  env: { LC_ALL: "C" },
                  extendEnv: true,
                }
              )
            )
            const [stdout, stderr, exitCode] = yield* Effect.all(
              [
                Stream.mkString(Stream.decodeText(handle.stdout)),
                Stream.mkString(Stream.decodeText(handle.stderr)),
                handle.exitCode,
              ],
              { concurrency: 3 }
            )

            return {
              exitCode: Number(exitCode),
              stderr,
              stdout,
            } satisfies RemoteTagCommandResult
          })
        )
      )
    })
  )
}

export const getTagCandidates = ({ name, version }: PackageIdentity) => [
  `v${version}`,
  version,
  `${name}@${version}`,
]

export const matchRepositoryTag = (identity: PackageIdentity, availableTags: readonly string[]) => {
  const availableTagSet = new Set(availableTags)

  return Option.fromNullishOr(
    getTagCandidates(identity).find((candidate) => availableTagSet.has(candidate))
  )
}
