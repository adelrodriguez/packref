import type * as PlatformError from "effect/PlatformError"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import * as ChildProcess from "effect/unstable/process/ChildProcess"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

export interface CommandRunnerResult {
  readonly exitCode: number
  readonly stderr: string
  readonly stdout: string
}

interface CommandRunnerService {
  readonly run: (
    command: string,
    args: readonly string[],
    options?: {
      readonly cwd?: string
    }
  ) => Effect.Effect<CommandRunnerResult, PlatformError.PlatformError>
}

export class CommandRunner extends Context.Service<CommandRunner, CommandRunnerService>()(
  "CommandRunner"
) {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const childProcessSpawner = yield* ChildProcessSpawner

      return {
        run: (command, args, options) =>
          Effect.scoped(
            Effect.gen(function* () {
              const handle = yield* childProcessSpawner.spawn(
                ChildProcess.make(
                  command,
                  [...args],
                  options?.cwd === undefined ? undefined : { cwd: options.cwd }
                )
              )
              const [stdout, stderr, exitCode] = yield* Effect.all([
                Stream.mkString(Stream.decodeText(handle.stdout)),
                Stream.mkString(Stream.decodeText(handle.stderr)),
                handle.exitCode,
              ])

              return {
                exitCode: Number(exitCode),
                stderr,
                stdout,
              } satisfies CommandRunnerResult
            })
          ),
      } satisfies CommandRunnerService
    })
  )
}
