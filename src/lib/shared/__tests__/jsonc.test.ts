import type * as Schema from "effect/Schema"
import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"
import { setProperty } from "#lib/shared/jsonc.ts"

const setPropertyOrThrow = (text: string, name: string, value: Schema.Json) =>
  Option.getOrThrow(setProperty(text, name, value))

describe("setProperty", () => {
  it("returns None when the root is not an object", () => {
    expect(setProperty("[]", "exclude", [])).toEqual(Option.none())
  })

  it("replaces the value of an existing property and keeps the comments", () => {
    const text = `{
  // Comments stay.
  "compilerOptions": {
    "noEmit": true,
  },
  "exclude": [
    "node_modules",
  ],
}
`

    expect(setPropertyOrThrow(text, "exclude", ["node_modules", ".packref"])).toBe(`{
  // Comments stay.
  "compilerOptions": {
    "noEmit": true,
  },
  "exclude": [
    "node_modules",
    ".packref"
  ],
}
`)
  })

  it("adds a property after the last property", () => {
    const text = `{
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src"]
}
`

    expect(setPropertyOrThrow(text, "exclude", [".packref"])).toBe(`{
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src"],
  "exclude": [
    ".packref"
  ]
}
`)
  })

  it("adds a property before a trailing comma", () => {
    expect(setPropertyOrThrow(`{\n  "include": ["src"],\n}\n`, "exclude", [".packref"])).toBe(
      `{\n  "include": ["src"],\n  "exclude": [\n    ".packref"\n  ],\n}\n`
    )
  })

  it("adds a property to an object on one line", () => {
    expect(setPropertyOrThrow(`{ "include": ["src"] }`, "exclude", [".packref"])).toBe(
      `{ "include": ["src"], "exclude": [".packref"] }`
    )
  })

  it("adds a property to an empty object", () => {
    expect(setPropertyOrThrow("{}\n", "exclude", [".packref"])).toBe(
      `{\n  "exclude": [\n    ".packref"\n  ]\n}\n`
    )
  })

  it("uses the indentation of the document", () => {
    expect(setPropertyOrThrow(`{\n\t"include": ["src"]\n}`, "exclude", [".packref"])).toBe(
      `{\n\t"include": ["src"],\n\t"exclude": [\n\t\t".packref"\n\t]\n}`
    )
  })

  it("ignores keys, brackets, and commas in nested values, strings, and comments", () => {
    const text = `{
  /* "exclude": [], { */
  "references": [{ "exclude": "a,b}" }],
  "files": ["]"] // "exclude"
}`

    expect(setPropertyOrThrow(text, "exclude", [".packref"])).toBe(`{
  /* "exclude": [], { */
  "references": [{ "exclude": "a,b}" }],
  "files": ["]"],
  "exclude": [
    ".packref"
  ] // "exclude"
}`)
  })

  it("matches unquoted and single-quoted keys", () => {
    expect(setPropertyOrThrow(`{ exclude: [], 'files': [] }`, "files", ["a"])).toBe(
      `{ exclude: [], 'files': ["a"] }`
    )
  })
})
