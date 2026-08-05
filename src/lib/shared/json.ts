import { applyEdits, format } from "jsonc-parser"

export const formatJson = (json: string) =>
  applyEdits(
    json,
    format(json, undefined, {
      insertFinalNewline: true,
      insertSpaces: true,
      tabSize: 2,
    })
  )
