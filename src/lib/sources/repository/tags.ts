import type * as PlatformError from "effect/PlatformError"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Filter from "effect/Filter"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import * as Schedule from "effect/Schedule"
import * as Stream from "effect/Stream"
import * as ChildProcess from "effect/unstable/process/ChildProcess"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import type { RemoteRepositoryRefs } from "#lib/core/repository.ts"
import type { NormalizedRepositorySource } from "#lib/core/source.ts"
import { GitExecutableNotFoundError, NetworkError } from "#lib/core/errors.ts"
import { parseGitRemoteRefsOutput, parseGitRemoteTagsOutput } from "#lib/logic/repository-tags.ts"

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

interface RemoteTagReaderService {
  readonly list: (
    source: NormalizedRepositorySource
  ) => Effect.Effect<readonly string[], GitExecutableNotFoundError | NetworkError>
  readonly listRefs: (
    source: NormalizedRepositorySource
  ) => Effect.Effect<RemoteRepositoryRefs, GitExecutableNotFoundError | NetworkError>
}

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
