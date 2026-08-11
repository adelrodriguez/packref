import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { PACKAGE_DIRECTORY_NAME } from "#lib/core/packages.ts"
import { emptyLockfile, readProjectLockfile, writeLockfileAtPath } from "#lib/workspace/lockfile.ts"
import { LOCKFILE_NAME, PACKREF_DIRECTORY_NAME } from "#lib/workspace/paths.ts"
import { requireInitializedProject } from "#lib/workspace/project.ts"

export interface ProjectCleanPlan {
  readonly entryCount: number
  readonly projectPath: string
}

export const discoverProjectCleanPlan = Effect.fn("discoverProjectCleanPlan")(function* () {
  const projectPath = yield* requireInitializedProject()
  const entryCount = yield* readProjectLockfile(projectPath).pipe(
    Effect.map((lockfile) => lockfile.packages.length),
    Effect.orElseSucceed(() => 0)
  )

  return {
    entryCount,
    projectPath,
  } satisfies ProjectCleanPlan
})

export const applyProjectCleanPlan = Effect.fn("applyProjectCleanPlan")(function* (
  plan: ProjectCleanPlan
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const packrefPath = path.join(plan.projectPath, PACKREF_DIRECTORY_NAME)

  yield* fs.remove(path.join(packrefPath, PACKAGE_DIRECTORY_NAME), {
    force: true,
    recursive: true,
  })
  yield* writeLockfileAtPath(path.join(packrefPath, LOCKFILE_NAME), emptyLockfile)

  return plan.entryCount
})
