import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Filter from "effect/Filter"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { ConfigParseError } from "#lib/core/errors.ts"
import { PackrefHome } from "#lib/services/packref-home.ts"
import { formatJson } from "#lib/shared/json.ts"
import { getGlobalConfigPath, getGlobalDirectoryPath } from "#lib/workspace/paths.ts"

export const GlobalConfigSchema = Schema.Struct({
  projects: Schema.Array(Schema.String),
})
export type GlobalConfig = typeof GlobalConfigSchema.Type

const GlobalConfigJsonSchema = Schema.fromJsonString(GlobalConfigSchema)

export const emptyGlobalConfig: GlobalConfig = {
  projects: [],
}

export const readGlobalConfigAtPath = (configPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const rawConfig = yield* fs.readFileString(configPath)

    return yield* Schema.decodeUnknownEffect(GlobalConfigJsonSchema)(rawConfig).pipe(
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
    const encodedConfig = formatJson(yield* Schema.encodeEffect(GlobalConfigJsonSchema)(config))

    yield* fs.writeFileString(configPath, encodedConfig)
  })

export const writeGlobalConfig = (config: GlobalConfig) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const home = yield* PackrefHome

    yield* writeGlobalConfigAtPath(getGlobalConfigPath(path, home.path), config)
  })

export const initializeGlobalConfig = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const home = yield* PackrefHome
    const globalDirectoryPath = getGlobalDirectoryPath(path, home.path)
    const configPath = getGlobalConfigPath(path, home.path)

    yield* fs.makeDirectory(globalDirectoryPath, { recursive: true })

    return yield* readGlobalConfigAtPath(configPath).pipe(
      Effect.catchFilter(Filter.reason("PlatformError", "NotFound"), () =>
        writeGlobalConfigAtPath(configPath, emptyGlobalConfig).pipe(Effect.as(emptyGlobalConfig))
      )
    )
  })

export const registerProject = (projectPath: string) =>
  Effect.gen(function* () {
    const config = yield* initializeGlobalConfig()

    if (config.projects.includes(projectPath)) {
      return config
    }

    const updatedConfig = {
      projects: [...config.projects, projectPath],
    } satisfies GlobalConfig

    yield* writeGlobalConfig(updatedConfig)

    return updatedConfig
  })

export const unregisterProjects = Effect.fn("unregisterProjects")(function* (
  projectPaths: readonly string[]
) {
  const config = yield* initializeGlobalConfig()
  const projects = config.projects.filter((projectPath) => !projectPaths.includes(projectPath))

  if (projects.length === config.projects.length) {
    return config
  }

  const updatedConfig = {
    projects,
  } satisfies GlobalConfig

  yield* writeGlobalConfig(updatedConfig)

  return updatedConfig
})
