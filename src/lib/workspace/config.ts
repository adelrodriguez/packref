import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Filter from "effect/Filter"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { ConfigParseError } from "#lib/core/errors.ts"
import { formatJson } from "#lib/shared/json.ts"
import { PackrefHome } from "#lib/workspace/home.ts"
import { GLOBAL_CONFIG_NAME, GLOBAL_DIRECTORY_SEGMENTS } from "#lib/workspace/paths.ts"

export const GlobalConfigSchema = Schema.Struct({
  projects: Schema.Array(Schema.String),
})
export type GlobalConfig = typeof GlobalConfigSchema.Type

const GlobalConfigJsonSchema = Schema.fromJsonString(GlobalConfigSchema)
const decodeGlobalConfig = Schema.decodeUnknownEffect(GlobalConfigJsonSchema)
const encodeGlobalConfig = Schema.encodeEffect(GlobalConfigJsonSchema)

export const emptyGlobalConfig: GlobalConfig = {
  projects: [],
}

export const readGlobalConfigAtPath = Effect.fn("readGlobalConfigAtPath")(function* (
  configPath: string
) {
  const fs = yield* FileSystem.FileSystem
  const rawConfig = yield* fs.readFileString(configPath)

  return yield* decodeGlobalConfig(rawConfig).pipe(
    Effect.mapError(
      (cause) =>
        new ConfigParseError({
          cause,
          path: configPath,
        })
    )
  )
})

export const writeGlobalConfigAtPath = Effect.fn("writeGlobalConfigAtPath")(function* (
  configPath: string,
  config: GlobalConfig
) {
  const fs = yield* FileSystem.FileSystem
  const encodedConfig = formatJson(yield* encodeGlobalConfig(config))

  yield* fs.writeFileString(configPath, encodedConfig)
})

export const writeGlobalConfig = Effect.fn("writeGlobalConfig")(function* (config: GlobalConfig) {
  const path = yield* Path.Path
  const home = yield* PackrefHome

  yield* writeGlobalConfigAtPath(
    path.join(home.path, ...GLOBAL_DIRECTORY_SEGMENTS, GLOBAL_CONFIG_NAME),
    config
  )
})

export const initializeGlobalConfig = Effect.fn("initializeGlobalConfig")(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const home = yield* PackrefHome
  const globalDirectoryPath = path.join(home.path, ...GLOBAL_DIRECTORY_SEGMENTS)
  const configPath = path.join(globalDirectoryPath, GLOBAL_CONFIG_NAME)

  yield* fs.makeDirectory(globalDirectoryPath, { recursive: true })

  return yield* readGlobalConfigAtPath(configPath).pipe(
    Effect.catchFilter(Filter.reason("PlatformError", "NotFound"), () =>
      writeGlobalConfigAtPath(configPath, emptyGlobalConfig).pipe(Effect.as(emptyGlobalConfig))
    )
  )
})

export const registerProject = Effect.fn("registerProject")(function* (projectPath: string) {
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
