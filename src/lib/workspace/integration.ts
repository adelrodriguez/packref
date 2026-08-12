import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Filter from "effect/Filter"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { FileUpdatePlan } from "#lib/core/integration.ts"
import {
  planAgentsUpdate,
  planGitignoreUpdate,
  planTsconfigUpdate,
} from "#lib/logic/workspace-integration.ts"

const GITIGNORE_NAME = ".gitignore"
const TSCONFIG_NAME = "tsconfig.json"
const AGENTS_NAME = "AGENTS.md"

const readOptionalFile = Effect.fn("readOptionalFile")(function* (path: string) {
  const fs = yield* FileSystem.FileSystem

  return yield* fs.readFileString(path).pipe(
    Effect.map(Option.some),
    Effect.catchFilter(Filter.reason("PlatformError", "NotFound"), () =>
      Effect.succeed(Option.none())
    )
  )
})

const applyFileUpdate = Effect.fn("applyFileUpdate")(function* (
  path: string,
  plan: FileUpdatePlan<string>
) {
  if (plan.content === undefined) return

  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFileString(path, plan.content)
})

export const ensureGitignoreEntry = Effect.fn("ensureGitignoreEntry")(function* (
  projectPath: string
) {
  const path = yield* Path.Path
  const gitignorePath = path.join(projectPath, GITIGNORE_NAME)
  const existing = yield* readOptionalFile(gitignorePath)

  yield* applyFileUpdate(gitignorePath, planGitignoreUpdate(Option.getOrNull(existing)))
})

export const ensureTsconfigExclude = Effect.fn("ensureTsconfigExclude")(function* (
  projectPath: string
) {
  const path = yield* Path.Path
  const tsconfigPath = path.join(projectPath, TSCONFIG_NAME)
  const existing = yield* readOptionalFile(tsconfigPath)
  const plan = planTsconfigUpdate(Option.getOrNull(existing))

  yield* applyFileUpdate(tsconfigPath, plan)

  return plan.status
})

export const writeAgentsSection = Effect.fn("writeAgentsSection")(function* (projectPath: string) {
  const path = yield* Path.Path
  const agentsPath = path.join(projectPath, AGENTS_NAME)
  const existing = yield* readOptionalFile(agentsPath)
  const plan = planAgentsUpdate(Option.getOrNull(existing))

  yield* applyFileUpdate(agentsPath, plan)

  return plan.status
})
