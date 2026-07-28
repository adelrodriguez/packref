import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import type { PackageIdentity } from "#lib/core/packages.ts"
import type { PackageSource } from "#lib/core/source.ts"
import { ReflinkError } from "#lib/core/errors.ts"
import { Reflinker } from "#lib/services/reflinker.ts"
import { checkIsPathWithin } from "#lib/shared/path.ts"
import { getStorePackagePath } from "#lib/store/paths.ts"
import { getDirectoryPath } from "#lib/workspace/paths.ts"

export const ensureDirectory = (projectPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const directoryPath = getDirectoryPath(path, projectPath)

    yield* fs.makeDirectory(directoryPath, { recursive: true })

    return directoryPath
  })

export const createProjectReference = Effect.fn("createProjectReference")(function* (
  projectPath: string,
  identity: PackageIdentity,
  storePath: string,
  source: PackageSource
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const reflinker = yield* Reflinker
  const projectDirectoryPath = getDirectoryPath(path, projectPath)
  const targetPath = yield* getStorePackagePath(projectDirectoryPath, identity)
  const exists = yield* fs.exists(targetPath)

  if (exists) {
    return targetPath
  }

  const referenceSourcePath =
    source.type === "repository" && source.directory !== undefined
      ? path.resolve(storePath, source.directory)
      : storePath

  if (!checkIsPathWithin(path, storePath, referenceSourcePath)) {
    return yield* new ReflinkError({
      cause: `Repository directory escapes the stored snapshot: ${source.type === "repository" ? source.directory : ""}`,
      source: storePath,
      target: targetPath,
    })
  }

  yield* fs.makeDirectory(path.dirname(targetPath), { recursive: true }).pipe(
    Effect.mapError(
      (cause) =>
        new ReflinkError({
          cause,
          source: referenceSourcePath,
          target: targetPath,
        })
    )
  )
  yield* Effect.scoped(
    Effect.gen(function* () {
      const temporaryRootPath = yield* fs
        .makeTempDirectoryScoped({
          directory: path.dirname(targetPath),
          prefix: ".packref-reference-",
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new ReflinkError({
                cause,
                source: referenceSourcePath,
                target: targetPath,
              })
          )
        )
      const temporaryReferencePath = path.join(temporaryRootPath, "reference")

      yield* reflinker.reflink(referenceSourcePath, temporaryReferencePath)
      yield* fs.rename(temporaryReferencePath, targetPath).pipe(
        Effect.mapError(
          (cause) =>
            new ReflinkError({
              cause,
              source: referenceSourcePath,
              target: targetPath,
            })
        )
      )
    })
  )

  return targetPath
})
