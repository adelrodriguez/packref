import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import packageJson from "../package.json" with { type: "json" }

const packageRoot = join(import.meta.dirname, "..")
const temporaryDirectory = mkdtempSync(join(tmpdir(), "packref-build-"))
const expectedFiles = [packageJson.bin.packref, "dist/index.js"]

function run(command: string, arguments_: string[], cwd: string) {
  execFileSync(command, arguments_, { cwd, stdio: "inherit" })
}

function read(command: string, arguments_: string[], cwd: string) {
  return execFileSync(command, arguments_, { cwd, encoding: "utf8" })
}

try {
  for (const relativePath of expectedFiles) {
    if (!existsSync(join(packageRoot, relativePath))) {
      throw new Error(`The package file does not exist: ${relativePath}`)
    }
  }

  run("pnpm", ["pack", "--pack-destination", temporaryDirectory], packageRoot)

  const tarballs = readdirSync(temporaryDirectory).filter((file) => file.endsWith(".tgz"))
  const [tarball] = tarballs
  if (!tarball || tarballs.length !== 1) {
    throw new Error(`Expected one package tarball, found ${tarballs.length}`)
  }

  writeFileSync(
    join(temporaryDirectory, "package.json"),
    `${JSON.stringify({ name: "packref-build-verification", private: true }, null, 2)}\n`
  )
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      "--omit=dev",
      join(temporaryDirectory, tarball),
    ],
    temporaryDirectory
  )

  const installedCli = join(
    temporaryDirectory,
    "node_modules",
    packageJson.name,
    packageJson.bin.packref
  )
  const version = read(process.execPath, [installedCli, "--version"], temporaryDirectory).trim()
  if (version !== `${packageJson.name} v${packageJson.version}`) {
    throw new Error(`Expected ${packageJson.name} v${packageJson.version}, received ${version}`)
  }

  const help = read(process.execPath, [installedCli, "--help"], temporaryDirectory)
  if (!help.includes(packageJson.description)) {
    throw new Error("The packed CLI help does not contain the package description")
  }

  console.info("Verified the packed Packref CLI with production dependencies.")
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true })
}
