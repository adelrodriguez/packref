import type { ConfirmOptions, LogMessageOptions, MultiSelectOptions } from "@clack/prompts"
import * as prompts from "@clack/prompts"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export interface PromptSpinner {
  readonly message: (message?: string) => void
  readonly start: (message?: string) => void
  readonly stop: (message?: string) => void
}

type PromptResult = boolean | symbol | readonly object[]

export interface PromptAdapterService {
  readonly cancel: (message: string) => Effect.Effect<void>
  readonly confirm: (options: ConfirmOptions) => Effect.Effect<boolean | symbol>
  readonly intro: (message: string) => Effect.Effect<void>
  readonly isCancel: (value: PromptResult) => boolean
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
  ) => Effect.Effect<T[] | symbol>
  readonly outro: (message: string) => Effect.Effect<void>
  readonly spinner: () => Effect.Effect<PromptSpinner>
}

export class PromptAdapter extends Context.Service<PromptAdapter, PromptAdapterService>()(
  "PromptAdapter"
) {
  static readonly layer = Layer.effect(
    this,
    Effect.sync(() =>
      this.of({
        cancel: Effect.fn("PromptAdapter.cancel")((message: string) =>
          Effect.sync(() => {
            prompts.cancel(message)
          })
        ),
        confirm: Effect.fn("PromptAdapter.confirm")((options: ConfirmOptions) =>
          Effect.promise(() => prompts.confirm(options))
        ),
        intro: Effect.fn("PromptAdapter.intro")((message: string) =>
          Effect.sync(() => {
            prompts.intro(message)
          })
        ),
        isCancel: prompts.isCancel,
        log: {
          error: Effect.fn("PromptAdapter.log.error")((message: string) =>
            Effect.sync(() => {
              prompts.log.error(message)
            })
          ),
          info: Effect.fn("PromptAdapter.log.info")((message: string) =>
            Effect.sync(() => {
              prompts.log.info(message)
            })
          ),
          message: Effect.fn("PromptAdapter.log.message")(
            (message: string | string[], options?: LogMessageOptions) =>
              Effect.sync(() => {
                prompts.log.message(message, options)
              })
          ),
          success: Effect.fn("PromptAdapter.log.success")((message: string) =>
            Effect.sync(() => {
              prompts.log.success(message)
            })
          ),
          warning: Effect.fn("PromptAdapter.log.warning")((message: string) =>
            Effect.sync(() => {
              prompts.log.warning(message)
            })
          ),
        },
        multiselect: Effect.fn("PromptAdapter.multiselect")(
          <T extends object>(options: MultiSelectOptions<T>) =>
            Effect.promise(() => prompts.multiselect(options))
        ),
        outro: Effect.fn("PromptAdapter.outro")((message: string) =>
          Effect.sync(() => {
            prompts.outro(message)
          })
        ),
        spinner: Effect.fn("PromptAdapter.spinner")(() => Effect.sync(() => prompts.spinner())),
      })
    )
  )
}
