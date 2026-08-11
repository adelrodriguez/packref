import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Filter from "effect/Filter"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { applyEdits, modify, type ParseError, parse } from "jsonc-parser"

const LEGACY_PACKREF_IGNORE_ENTRIES = new Set([".packref", ".packref/"])
const PACKREF_PACKAGES_IGNORE_ENTRY = ".packref/packages/"
const PACKREF_TEMP_LOCKFILE_IGNORE_ENTRY = ".packref/.packref-lock-*.tmp"
const PACKREF_IGNORE_ENTRIES = [
  PACKREF_PACKAGES_IGNORE_ENTRY,
  PACKREF_TEMP_LOCKFILE_IGNORE_ENTRY,
] as const
const PACKREF_IGNORE_ENTRY_SET = new Set<string>(PACKREF_IGNORE_ENTRIES)
const GITIGNORE_NAME = ".gitignore"
const TSCONFIG_NAME = "tsconfig.json"
const AGENTS_NAME = "AGENTS.md"

export const PACKREF_AGENTS_START_MARKER = "<!-- PACKREF:START -->"
export const PACKREF_AGENTS_END_MARKER = "<!-- PACKREF:END -->"

const PACKREF_AGENTS_BODY = `## Packref

Packref provides local copies of dependency source code so you can inspect the exact implementation used by this project.

- Source references are stored in \`.packref/packages/<registry>/<package>/<version>/\` for unscoped packages and \`.packref/packages/<registry>/<scope>/<package>/<version>/\` for scoped packages — browse these directories to read dependency internals
- \`.packref/packref-lock.json\` is shared and should be committed; \`.packref/packages/\` is developer-local and git-ignored
- Run \`packref install\` after cloning when locked references are missing; install restores locked references exactly and does not install runtime dependencies
- Available commands:
  - \`packref add [package]\` — select manifest dependencies, fetch a registry package, or fetch a direct repository source (e.g. \`packref add react\`, \`packref add hono@4.2.0\`, \`packref add metaideas/packref\`)
    - Direct repository package specs support GitHub shorthand (\`owner/repository[/directory][@ref]\`), provider shorthand (\`github:\`, \`gitlab:\`, \`bitbucket:\`, or \`sourcehut:\`), standard Git URLs, and SCP-style SSH URLs
    - A repository ref can be a tag, branch, or commit SHA; without a ref, Packref pins the default branch commit
  - \`packref remove [package]\` — select or name package references to remove
  - \`packref install\` — materialize every reference already recorded in the committed lockfile
  - \`packref sync\` — update dependency-tracked lock entries to match current \`package.json\` dependency versions
  - \`packref list\` — show all referenced packages
  - \`packref prune\` — remove unused entries from the global store
  - \`packref clean\` — remove all project-local references
  - \`packref clean --global\` — wipe all global store entries
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

const decodeTsconfig = Schema.decodeUnknownEffect(TsconfigSchema)

const readOptionalFile = Effect.fn("readOptionalFile")(function* (path: string) {
  const fs = yield* FileSystem.FileSystem

  return yield* fs.readFileString(path).pipe(
    Effect.map(Option.some),
    Effect.catchFilter(Filter.reason("PlatformError", "NotFound"), () =>
      Effect.succeed(Option.none())
    )
  )
})

const checkIsPackrefEntry = (entry: string) => LEGACY_PACKREF_IGNORE_ENTRIES.has(entry.trim())

export const ensureGitignoreEntry = Effect.fn("ensureGitignoreEntry")(function* (
  projectPath: string
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const gitignorePath = path.join(projectPath, GITIGNORE_NAME)
  const existing = yield* readOptionalFile(gitignorePath)

  const content = Option.getOrElse(existing, () => "")
  const newline = content.includes("\r\n") ? "\r\n" : "\n"
  const hasFinalNewline = content.endsWith(newline)
  const body = hasFinalNewline ? content.slice(0, -newline.length) : content
  const lines = body.length === 0 ? [] : body.split(newline)
  const nextLines: string[] = []
  const foundEntries = new Set(lines.filter((line) => PACKREF_IGNORE_ENTRY_SET.has(line)))

  for (const line of lines) {
    if (!checkIsPackrefEntry(line)) {
      nextLines.push(line)
      continue
    }

    for (const entry of PACKREF_IGNORE_ENTRIES) {
      if (!foundEntries.has(entry)) {
        nextLines.push(entry)
        foundEntries.add(entry)
      }
    }
  }

  for (const entry of PACKREF_IGNORE_ENTRIES) {
    if (!foundEntries.has(entry)) {
      nextLines.push(entry)
    }
  }

  const nextContent = `${nextLines.join(newline)}${Option.isNone(existing) || hasFinalNewline ? newline : ""}`

  if (nextContent !== content) {
    yield* fs.writeFileString(gitignorePath, nextContent)
  }
})

export const ensureTsconfigExclude = Effect.fn("ensureTsconfigExclude")(
  function* (projectPath: string) {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const tsconfigPath = path.join(projectPath, TSCONFIG_NAME)
    const optionalExisting = yield* readOptionalFile(tsconfigPath)

    if (Option.isNone(optionalExisting)) {
      return "missing"
    }

    const existing = optionalExisting.value
    const parseErrors: ParseError[] = []
    const decoded = parse(existing, parseErrors, { allowTrailingComma: true })

    if (parseErrors.length > 0) {
      return "malformed"
    }

    const parsed = yield* decodeTsconfig(decoded)

    if (parsed.exclude?.some((entry) => checkIsPackrefEntry(entry))) {
      return "updated"
    }

    const edits = modify(existing, ["exclude"], [...(parsed.exclude ?? []), ".packref"], {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    })

    yield* fs.writeFileString(tsconfigPath, applyEdits(existing, edits))
    return "updated"
  },
  Effect.catchTag("SchemaError", () => Effect.succeed("malformed"))
)

export const writeAgentsSection = Effect.fn("writeAgentsSection")(function* (projectPath: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const agentsPath = path.join(projectPath, AGENTS_NAME)
  const existing = yield* readOptionalFile(agentsPath)
  const content = Option.getOrElse(existing, () => "")
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
