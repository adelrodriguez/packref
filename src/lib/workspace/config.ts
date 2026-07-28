import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as PlatformError from "effect/PlatformError"
import * as Schema from "effect/Schema"
import { ConfigParseError } from "#lib/core/errors.ts"
import { getGlobalConfigPath, getGlobalDirectoryPath } from "#lib/workspace/paths.ts"

export const GlobalConfigSchema = Schema.Struct({
  projects: Schema.Array(Schema.String),
})
export type GlobalConfig = typeof GlobalConfigSchema.Type

export const emptyGlobalConfig: GlobalConfig = {
  projects: [],
}

export const readGlobalConfigAtPath = (configPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const rawConfig = yield* fs.readFileString(configPath)

    return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(GlobalConfigSchema))(
      rawConfig
    ).pipe(
      Effect.mapError(
        (cause) =>
          new ConfigParseError({
            cause,
            path: configPath,
          })
      )
    )
  })

export const writeGlobalConfigAtPath = (configPath: string, config: GlobalConfig) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const decodedConfig = yield* Schema.decodeUnknownEffect(GlobalConfigSchema)(config)

    yield* fs.writeFileString(configPath, `${JSON.stringify(decodedConfig, null, 2)}\n`)
  })

export const writeGlobalConfig = (config: GlobalConfig, home?: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    yield* writeGlobalConfigAtPath(getGlobalConfigPath(path, home), config)
  })

export const initializeGlobalConfig = (home?: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const globalDirectoryPath = getGlobalDirectoryPath(path, home)
    const configPath = getGlobalConfigPath(path, home)

    yield* fs.makeDirectory(globalDirectoryPath, { recursive: true })

    return yield* readGlobalConfigAtPath(configPath).pipe(
      Effect.catchTag("PlatformError", (error) => {
        if (error.reason instanceof PlatformError.SystemError && error.reason._tag === "NotFound") {
          return writeGlobalConfigAtPath(configPath, emptyGlobalConfig).pipe(
            Effect.as(emptyGlobalConfig)
          )
        }

        return Effect.fail(error)
      })
    )
  })

export const registerProject = (projectPath: string, home?: string) =>
  Effect.gen(function* () {
    const config = yield* initializeGlobalConfig(home)

    if (config.projects.includes(projectPath)) {
      return config
    }

    const updatedConfig = {
      projects: [...config.projects, projectPath],
    } satisfies GlobalConfig

    yield* writeGlobalConfig(updatedConfig, home)

    return updatedConfig
  })
