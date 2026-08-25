import type { ConfirmOptions, LogMessageOptions, MultiSelectOptions } from "@clack/prompts"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import { OperationCancelled } from "#lib/core/errors.ts"
import { PromptAdapter } from "#terminal/prompt-adapter.ts"

interface PrompterService {
  readonly cancel: (message: string) => Effect.Effect<void>
  readonly confirm: (options: ConfirmOptions) => Effect.Effect<boolean, OperationCancelled>
  readonly intro: (message: string) => Effect.Effect<void>
  readonly log: {
    readonly error: (message: string) => Effect.Effect<void>
    readonly info: (message: string) => Effect.Effect<void>
    readonly message: (
      message: string | string[],
      options?: LogMessageOptions
    ) => Effect.Effect<void>
    readonly success: (message: string) => Effect.Effect<void>
    readonly warning: (message: string) => Effect.Effect<void>
  }
  readonly multiselect: <T extends object>(
    options: MultiSelectOptions<T>
  ) => Effect.Effect<T[], OperationCancelled>
  readonly outro: (message: string) => Effect.Effect<void>
  readonly withSpinner: <A, E, R>(
    run: (spinner: {
      readonly message: (message: string) => Effect.Effect<void>
    }) => Effect.Effect<A, E, R>,
    options: {
      readonly failure?: string
      readonly start: string
      readonly success: string | ((value: A) => string | undefined)
    }
  ) => Effect.Effect<A, E, R>
}

export class Prompter extends Context.Service<Prompter, PrompterService>()("Prompter") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const prompts = yield* PromptAdapter

      return Prompter.of({
        cancel: prompts.cancel,
        confirm: (options) =>
          prompts.confirm(options).pipe(
            Effect.filterOrFail(
              (value): value is boolean => !prompts.isCancel(value),
              () => new OperationCancelled({})
            )
          ),
        intro: prompts.intro,
        log: prompts.log,
        multiselect: <T extends object>(options: MultiSelectOptions<T>) =>
          prompts.multiselect(options).pipe(
            Effect.filterOrFail(
              (value): value is T[] => !prompts.isCancel(value),
              () => new OperationCancelled({})
            )
          ),
        outro: prompts.outro,
        withSpinner: (run, options) =>
          Effect.acquireUseRelease(
            prompts.spinner().pipe(
              Effect.tap((spinner) =>
                Effect.sync(() => {
                  spinner.start(options.start)
                })
              )
            ),
            (spinner) =>
              run({
                message: (message) =>
                  Effect.sync(() => {
                    spinner.message(message)
                  }),
              }),
            (spinner, exit) =>
              Effect.sync(() => {
                spinner.stop(
                  Exit.match(exit, {
                    onFailure: () => options.failure,
                    onSuccess: (value) =>
                      Match.value(options.success).pipe(
                        Match.when(Match.string, (message) => message),
                        Match.orElse((getMessage) => getMessage(value))
                      ),
                  })
                )
              })
          ),
      })
    })
  )
}
