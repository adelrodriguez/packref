import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { getDirectoryPath } from "#lib/workspace/paths.ts"

export const ensureDirectory = (projectPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const directoryPath = getDirectoryPath(path, projectPath)

    yield* fs.makeDirectory(directoryPath, { recursive: true })

    return directoryPath
  })
