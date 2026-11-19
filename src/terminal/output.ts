import { styleText } from "node:util"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"

type Format = Parameters<typeof styleText>[0]

/**
 * The status of a line, with the symbol and color that mark it. The symbols match the prompts of
 * `effect/cli/Prompt`, which mark an answer with `✔`.
 */
const STATUSES = {
  cancel: { color: "red", symbol: "■" },
  error: { color: "red", symbol: "✖" },
  info: { color: "blue", symbol: "●" },
  success: { color: "green", symbol: "✔" },
  warning: { color: "yellow", symbol: "▲" },
} as const satisfies Record<string, { readonly color: Format; readonly symbol: string }>

type Status = keyof typeof STATUSES

/**
 * Styles `text`, such as with `["bold", "yellow"]`, when the terminal renders color.
 */
export const style = (format: Format, text: string) =>
  Effect.map(TerminalCapabilities.TerminalCapabilities, ({ canColor }) =>
    canColor ? styleText(format, text, { validateStream: false }) : text
  )

// Continuation lines start under the text, after the symbol and its space. A blank line stays empty.
const renderStatus = (status: Status, message: string) =>
  Effect.map(
    style(STATUSES[status].color, STATUSES[status].symbol),
    (symbol) => `${symbol} ${message.replaceAll(/\n(?=.)/gu, "\n  ")}`
  )

const log = (status: Status) => (message: string) =>
  Effect.flatMap(renderStatus(status, message), (line) => Console.log(line))

export const info = log("info")

export const success = log("success")

export const warning = log("warning")

/**
 * Reports that the user quit a prompt, such as with Ctrl-C. A quit prompt of `effect/cli/Prompt`
 * leaves the cursor at the end of its last line, so the line starts with a line break.
 */
export const cancel = (message: string) =>
  Effect.flatMap(renderStatus("cancel", message), (line) => Console.log(`\n${line}`))

/**
 * Reports the error that ended the command, on standard error. Every other line goes to standard
 * output, so the lines and the prompts keep their order.
 */
export const failure = (message: string) =>
  Effect.flatMap(renderStatus("error", message), (line) => Console.error(line))

const heading = (text: string) => Effect.flatMap(style("bold", text), (line) => Console.log(line))

/**
 * Names the command at the start of its output, such as `🚚 packref init`.
 */
export const intro = heading

/**
 * States the outcome of the command at the end of its output.
 */
export const outro = heading

/**
 * Prints lines as they are, such as a table that marks its own rows.
 */
export const lines = (text: readonly string[]) => Console.log(text.join("\n"))
