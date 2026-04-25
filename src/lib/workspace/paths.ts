import type * as Path from "effect/Path"
import { homedir } from "node:os"

export const PACKREF_DIRECTORY_NAME = ".packref"
export const LOCKFILE_NAME = "packref-lock.json"
export const GLOBAL_DIRECTORY_SEGMENTS = [".agents", "packref"] as const
export const GLOBAL_CONFIG_NAME = "config.json"

export const getDirectoryPath = (path: Path.Path, projectPath: string) =>
  path.join(projectPath, PACKREF_DIRECTORY_NAME)

export const getProjectLockfilePath = (path: Path.Path, projectPath: string) =>
  path.join(getDirectoryPath(path, projectPath), LOCKFILE_NAME)

export const getGlobalDirectoryPath = (path: Path.Path, home = homedir()) =>
  path.join(home, ...GLOBAL_DIRECTORY_SEGMENTS)

export const getGlobalConfigPath = (path: Path.Path, home = homedir()) =>
  path.join(getGlobalDirectoryPath(path, home), GLOBAL_CONFIG_NAME)
