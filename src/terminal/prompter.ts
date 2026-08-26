import type { ConfirmOptions, LogMessageOptions, MultiSelectOptions } from "@clack/prompts"
import * as prompts from "@clack/prompts"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import { OperationCancelled } from "#lib/core/errors.ts"

export interface PromptSpinner {
  readonly message: (message?: string) => void
  readonly start: (message?: string) => void
  readonly stop: (message?: string) => void
}

export interface PrompterPrimitives {
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
  readonly spinner: () => Effect.Effect<PromptSpinner>
}

interface PrompterService extends Omit<PrompterPrimitives, "spinner"> {
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
  static readonly make = (primitives: PrompterPrimitives): PrompterService => ({
    ...primitives,
    withSpinner: (run, options) =>
      Effect.acquireUseRelease(
        primitives.spinner().pipe(
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

  static readonly layer = Layer.succeed(this)(
    this.make({
      cancel: Effect.fn("Prompter.cancel")((message: string) =>
        Effect.sync(() => {
          prompts.cancel(message)
        })
      ),
      confirm: Effect.fn("Prompter.confirm")((options: ConfirmOptions) =>
        Effect.promise(() => prompts.confirm(options)).pipe(
          Effect.filterOrFail(
            (value): value is boolean => !prompts.isCancel(value),
            () => new OperationCancelled({})
          )
        )
      ),
      intro: Effect.fn("Prompter.intro")((message: string) =>
        Effect.sync(() => {
          prompts.intro(message)
        })
      ),
      log: {
        error: Effect.fn("Prompter.log.error")((message: string) =>
          Effect.sync(() => {
            prompts.log.error(message)
          })
        ),
        info: Effect.fn("Prompter.log.info")((message: string) =>
          Effect.sync(() => {
            prompts.log.info(message)
          })
        ),
        message: Effect.fn("Prompter.log.message")(
          (message: string | string[], options?: LogMessageOptions) =>
            Effect.sync(() => {
              prompts.log.message(message, options)
            })
        ),
        success: Effect.fn("Prompter.log.success")((message: string) =>
          Effect.sync(() => {
            prompts.log.success(message)
          })
        ),
        warning: Effect.fn("Prompter.log.warning")((message: string) =>
          Effect.sync(() => {
            prompts.log.warning(message)
          })
        ),
      },
      multiselect: Effect.fn("Prompter.multiselect")(
        <T extends object>(options: MultiSelectOptions<T>) =>
          Effect.promise(() => prompts.multiselect(options)).pipe(
            Effect.filterOrFail(
              (value): value is T[] => !prompts.isCancel(value),
              () => new OperationCancelled({})
            )
          )
      ),
      outro: Effect.fn("Prompter.outro")((message: string) =>
        Effect.sync(() => {
          prompts.outro(message)
        })
      ),
      spinner: Effect.fn("Prompter.spinner")(() => Effect.sync(() => prompts.spinner())),
    })
  )
}
