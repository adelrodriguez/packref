import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as PlatformError from "effect/PlatformError"
import * as Schema from "effect/Schema"
import { applyEdits, modify, type ParseError, parse } from "jsonc-parser"

const PACKREF_IGNORE_ENTRY = ".packref"
const GITIGNORE_NAME = ".gitignore"
const TSCONFIG_NAME = "tsconfig.json"
const AGENTS_NAME = "AGENTS.md"

export const PACKREF_AGENTS_START_MARKER = "<!-- PACKREF:START -->"
export const PACKREF_AGENTS_END_MARKER = "<!-- PACKREF:END -->"

const PACKREF_AGENTS_BODY = `## Packref

Packref provides local copies of dependency source code so you can inspect the exact implementation used by this project.

- Source references are stored in \`.packref/packages/<registry>/<package>/<version>/\` for unscoped packages and \`.packref/packages/<registry>/<scope>/<package>/<version>/\` for scoped packages — browse these directories to read dependency internals
- \`.packref/\` is developer-local and git-ignored; run \`packref init\` to set up, then \`packref add <package>\` to fetch references
- Available commands:
  - \`packref add <package>\` — fetch source for a package (e.g. \`packref add react\`, \`packref add hono@4.2.0\`, \`packref add @effect/cli\`)
  - \`packref remove <package>\` — remove a package reference
  - \`packref sync\` — update references to match current \`package.json\` dependency versions
  - \`packref list\` — show all referenced packages
  - \`packref prune\` — remove unused entries from the global store
  - \`packref clean\` — wipe all global store entries
- Use Packref when you need to understand how a dependency works internally — read the source in \`.packref/\` instead of guessing or searching the web
- Multiple versions of the same package can coexist; check \`.packref/packref-lock.json\` for the full list`

export const PACKREF_AGENTS_SECTION = [
  PACKREF_AGENTS_START_MARKER,
  "",
  PACKREF_AGENTS_BODY,
  PACKREF_AGENTS_END_MARKER,
  "",
].join("\n")

export const TsconfigSchema = Schema.StructWithRest(
  Schema.Struct({
    exclude: Schema.optional(Schema.Array(Schema.String)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
)
export type Tsconfig = typeof TsconfigSchema.Type

const readOptionalFile = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem

    return yield* fs.readFileString(path)
  }).pipe(
    Effect.catchTag("PlatformError", (error) => {
      if (error.reason instanceof PlatformError.SystemError && error.reason._tag === "NotFound") {
        return Effect.void
      }

      return Effect.fail(error)
    })
  )

const checkIsPackrefEntry = (entry: string) =>
  entry === PACKREF_IGNORE_ENTRY || entry === `${PACKREF_IGNORE_ENTRY}/`

export const ensureGitignoreEntry = (projectPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const gitignorePath = path.join(projectPath, GITIGNORE_NAME)
    const existing = yield* readOptionalFile(gitignorePath)

    if (
      existing
        ?.split(/\r?\n/)
        .map((line) => line.trim())
        .some((line) => checkIsPackrefEntry(line))
    ) {
      return
    }

    const content = existing ?? ""
    const separator = content.length === 0 ? "" : content.endsWith("\n") ? "" : "\n"

    yield* fs.writeFileString(gitignorePath, `${content}${separator}${PACKREF_IGNORE_ENTRY}\n`)
  })

export const ensureTsconfigExclude = (projectPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const tsconfigPath = path.join(projectPath, TSCONFIG_NAME)
    const existing = yield* readOptionalFile(tsconfigPath)

    if (existing === undefined) {
      return "missing"
    }

    const parseErrors: ParseError[] = []
    const decoded = parse(existing, parseErrors, { allowTrailingComma: true })

    if (parseErrors.length > 0) {
      return "malformed"
    }

    const parsed: Tsconfig = yield* Schema.decodeUnknownEffect(TsconfigSchema)(decoded)

    if (parsed.exclude?.some((entry) => checkIsPackrefEntry(entry))) {
      return "updated"
    }

    const edits = modify(existing, ["exclude"], [...(parsed.exclude ?? []), PACKREF_IGNORE_ENTRY], {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    })

    yield* fs.writeFileString(tsconfigPath, applyEdits(existing, edits))
    return "updated"
  }).pipe(Effect.catchTag("SchemaError", () => Effect.succeed("malformed")))

export const writeAgentsSection = (projectPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const agentsPath = path.join(projectPath, AGENTS_NAME)
    const existing = yield* readOptionalFile(agentsPath)
    const content = existing ?? ""
    const start = content.indexOf(PACKREF_AGENTS_START_MARKER)
    const endMarkerIndex = content.indexOf(PACKREF_AGENTS_END_MARKER)

    if (start !== -1 && endMarkerIndex !== -1 && start < endMarkerIndex) {
      const end = endMarkerIndex + PACKREF_AGENTS_END_MARKER.length
      const nextContent = `${content.slice(0, start)}${PACKREF_AGENTS_SECTION.trimEnd()}${content.slice(end)}`

      yield* fs.writeFileString(
        agentsPath,
        nextContent.endsWith("\n") ? nextContent : `${nextContent}\n`
      )
      return "updated"
    }

    if (start !== -1 || endMarkerIndex !== -1) {
      return "malformed"
    }

    const separator = content.length === 0 ? "" : content.endsWith("\n") ? "\n" : "\n\n"

    yield* fs.writeFileString(agentsPath, `${content}${separator}${PACKREF_AGENTS_SECTION}`)
    return "updated"
  })
