import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import { describe, expect, test } from "vitest"
import { OperationCancelled } from "#lib/core/errors.ts"
import {
  PromptAdapter,
  type PromptAdapterService,
  type PromptSpinner,
} from "#terminal/prompt-adapter.ts"
import { Prompter } from "#terminal/prompter.ts"

const succeedVoid = () => Effect.succeed(void 0)

function createSpinner() {
  const messages: string[] = []
  const starts: Array<string | undefined> = []
  const stops: Array<string | undefined> = []
  const spinner: PromptSpinner = {
    message(message) {
      if (message !== undefined) {
        messages.push(message)
      }
    },
    start(message) {
      starts.push(message)
    },
    stop(message) {
      stops.push(message)
    },
  }

  return { messages, spinner, starts, stops }
}

const cancelledPrompt = Symbol("cancelledPrompt")

const makePromptAdapterLayer = (
  spinner: PromptSpinner,
  options?: { readonly cancelPrompts?: boolean }
) => {
  const cancelPrompts = options?.cancelPrompts ?? false
  const service: PromptAdapterService = {
    cancel: succeedVoid,
    confirm: () => Effect.succeed(cancelPrompts ? cancelledPrompt : true),
    intro: succeedVoid,
    isCancel: (value) => value === cancelledPrompt,
    log: {
      error: succeedVoid,
      info: succeedVoid,
      message: succeedVoid,
      success: succeedVoid,
      warning: succeedVoid,
    },
    multiselect: <T extends object>() =>
      Effect.succeed(cancelPrompts ? cancelledPrompt : new Array<T>()),
    outro: succeedVoid,
    spinner: () => Effect.succeed(spinner),
  }

  return Layer.succeed(PromptAdapter)(service)
}

function runWithPrompter<A, E>(
  effect: Effect.Effect<A, E, Prompter>,
  spinner: PromptSpinner,
  options?: { readonly cancelPrompts?: boolean }
) {
  const layer = Prompter.layer.pipe(Layer.provide(makePromptAdapterLayer(spinner, options)))

  return Effect.runPromiseExit(effect.pipe(Effect.provide(layer)))
}

describe("Prompter.confirm", () => {
  test("returns the adapter value when the prompt completes", async () => {
    const { spinner } = createSpinner()

    const exit = await runWithPrompter(
      Effect.gen(function* () {
        const prompter = yield* Prompter
        return yield* prompter.confirm({ message: "Continue?" })
      }),
      spinner
    )

    expect(exit).toEqual(Exit.succeed(true))
  })

  test("fails with OperationCancelled when the prompt is cancelled", async () => {
    const { spinner } = createSpinner()

    const exit = await runWithPrompter(
      Effect.gen(function* () {
        const prompter = yield* Prompter
        return yield* prompter.confirm({ message: "Continue?" })
      }),
      spinner,
      { cancelPrompts: true }
    )

    expect(exit).toEqual(Exit.fail(new OperationCancelled({})))
  })
})

describe("Prompter.multiselect", () => {
  test("fails with OperationCancelled when the prompt is cancelled", async () => {
    const { spinner } = createSpinner()

    const exit = await runWithPrompter(
      Effect.gen(function* () {
        const prompter = yield* Prompter
        return yield* prompter.multiselect({
          message: "Select packages",
          options: [{ label: "effect", value: { name: "effect" } }],
        })
      }),
      spinner,
      { cancelPrompts: true }
    )

    expect(exit).toEqual(Exit.fail(new OperationCancelled({})))
  })
})

describe("Prompter.withSpinner", () => {
  test("manages the spinner around a successful effect", async () => {
    const { messages, spinner, starts, stops } = createSpinner()

    const exit = await runWithPrompter(
      Effect.gen(function* () {
        const prompter = yield* Prompter
        return yield* prompter.withSpinner(
          (control) =>
            Effect.gen(function* () {
              yield* control.message("Still working...")
              return 42
            }),
          {
            failure: "Operation failed.",
            start: "Starting operation...",
            success: (result) => `Operation returned ${result}.`,
          }
        )
      }),
      spinner
    )

    expect(exit).toEqual(Exit.succeed(42))
    expect(starts).toEqual(["Starting operation..."])
    expect(messages).toEqual(["Still working..."])
    expect(stops).toEqual(["Operation returned 42."])
  })

  test("stops the spinner when the effect fails", async () => {
    const { spinner, stops } = createSpinner()

    const exit = await runWithPrompter(
      Effect.gen(function* () {
        const prompter = yield* Prompter
        return yield* prompter.withSpinner(() => Effect.fail("failed"), {
          failure: "Operation failed.",
          start: "Starting operation...",
          success: "Operation succeeded.",
        })
      }),
      spinner
    )

    expect(Exit.isFailure(exit)).toBe(true)
    expect(stops).toEqual(["Operation failed."])
  })

  test("stops the spinner when the effect is interrupted", async () => {
    const { spinner, stops } = createSpinner()

    const exit = await runWithPrompter(
      Effect.gen(function* () {
        const prompter = yield* Prompter
        return yield* prompter.withSpinner(() => Effect.interrupt, {
          failure: "Operation interrupted.",
          start: "Starting operation...",
          success: "Operation succeeded.",
        })
      }),
      spinner
    )

    expect(Exit.isFailure(exit)).toBe(true)
    expect(stops).toEqual(["Operation interrupted."])
  })

  test("allows the failure message to be omitted", async () => {
    const { spinner, stops } = createSpinner()

    const exit = await runWithPrompter(
      Effect.gen(function* () {
        const prompter = yield* Prompter
        return yield* prompter.withSpinner(() => Effect.fail("failed"), {
          start: "Starting operation...",
          success: "Operation succeeded.",
        })
      }),
      spinner
    )

    expect(Exit.isFailure(exit)).toBe(true)
    expect(stops).toEqual([undefined])
  })
})
