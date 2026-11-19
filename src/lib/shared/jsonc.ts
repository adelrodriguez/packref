import type * as Schema from "effect/Schema"
import * as Json5 from "effect/encoding/Json5"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Result from "effect/Result"

/**
 * A token of a JSONC document. The depth of the root braces is 0, and the depth of the tokens of a
 * top-level property is 1. A bracket has the depth of the value that it opens or closes.
 */
interface Token {
  readonly depth: number
  readonly end: number
  readonly kind: "{" | "}" | "[" | "]" | ":" | "," | "value"
  readonly start: number
}

interface Property {
  readonly key: Token
  readonly name: string
  readonly value: { readonly end: Token; readonly start: Token }
}

// Whitespace and comments match without a group, so the tokenizer skips them.
const TOKEN_PATTERN =
  /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|(?<punctuation>[{}[\]:,])|(?<value>"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s{}[\]:,"'/]+)/guy

const tokenize = (text: string) => {
  const tokens: Token[] = []
  let depth = 0

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const start = match.index
    const end = start + match[0].length
    const punctuation = match.groups?.punctuation

    if (punctuation === "{" || punctuation === "[") {
      tokens.push({ depth, end, kind: punctuation, start })
      depth += 1
    } else if (punctuation === "}" || punctuation === "]") {
      depth -= 1
      tokens.push({ depth, end, kind: punctuation, start })
    } else if (punctuation === ":" || punctuation === ",") {
      tokens.push({ depth, end, kind: punctuation, start })
    } else if (match.groups?.value !== undefined) {
      tokens.push({ depth, end, kind: "value", start })
    }
  }

  return tokens
}

// A JSON5 key can be a string in either quote or an identifier without quotes.
const readKey = (text: string) =>
  text.startsWith('"') || text.startsWith("'")
    ? Result.getSuccess(Json5.parse(text)).pipe(Option.filter(Predicate.isString))
    : Option.some(text)

const readProperties = (text: string, tokens: readonly Token[]) =>
  tokens.flatMap((key, index): Property[] => {
    const start = tokens[index + 2]

    if (key.depth !== 1 || key.kind !== "value" || tokens[index + 1]?.kind !== ":" || !start) {
      return []
    }

    // The value ends before the next top-level comma or the closing root brace.
    const next = tokens.findIndex(
      (token, nextIndex) =>
        nextIndex > index + 2 && (token.depth === 0 || (token.depth === 1 && token.kind === ","))
    )
    const end = tokens[next - 1]

    return Option.match(readKey(text.slice(key.start, key.end)), {
      onNone: () => [],
      onSome: (name) => (end ? [{ key, name, value: { end, start } }] : []),
    })
  })

const getLineIndentation = (text: string, position: number) =>
  /^[ \t]*/u.exec(text.slice(text.lastIndexOf("\n", position - 1) + 1))?.[0] ?? ""

const splice = (text: string, start: number, end: number, insert: string) =>
  `${text.slice(0, start)}${insert}${text.slice(end)}`

/**
 * Sets a top-level property of a JSONC document, such as `tsconfig.json`, to `value`. The edit
 * keeps the comments and the formatting of the other properties, and a new property takes the
 * indentation of the document.
 *
 * The text must be a valid JSON5 document. The result is `None` when its root is not an object.
 */
export const setProperty = (text: string, name: string, value: Schema.Json) => {
  const tokens = tokenize(text)
  const open = tokens[0]
  const close = tokens.at(-1)

  if (open?.kind !== "{" || close?.kind !== "}") {
    return Option.none<string>()
  }

  const properties = readProperties(text, tokens)
  const [first] = properties
  const last = properties.at(-1)
  const existing = properties.find((property) => property.name === name)
  const isMultiline = first === undefined || text.slice(open.end, first.key.start).includes("\n")
  const unit = first && isMultiline ? getLineIndentation(text, first.key.start) : "  "
  const format = (indentation: string) =>
    isMultiline
      ? JSON.stringify(value, null, unit).replaceAll("\n", `\n${indentation}`)
      : JSON.stringify(value)
  const property = (indentation: string) => `${JSON.stringify(name)}: ${format(indentation)}`

  if (existing) {
    return Option.some(
      splice(
        text,
        existing.value.start.start,
        existing.value.end.end,
        format(getLineIndentation(text, existing.key.start))
      )
    )
  }

  if (last === undefined) {
    const inner = text.slice(open.end, close.start)
    const insert = `\n${unit}${property(unit)}`

    return Option.some(
      inner.trim().length === 0
        ? splice(text, open.end, close.start, `${insert}\n${getLineIndentation(text, close.start)}`)
        : splice(text, open.end, open.end, insert)
    )
  }

  const indentation = getLineIndentation(text, last.key.start)

  return Option.some(
    splice(
      text,
      last.value.end.end,
      last.value.end.end,
      isMultiline ? `,\n${indentation}${property(indentation)}` : `, ${property("")}`
    )
  )
}
