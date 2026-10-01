import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Each lib folder lists the folders it may import. A folder never imports a folder at the same or a
 * higher layer, so dependencies point in a single direction.
 */
const ALLOWED_DEPENDENCIES = {
  core: [],
  layout: ["core"],
  manifests: ["core"],
  references: [
    "core",
    "layout",
    "manifests",
    "registries",
    "shared",
    "sources",
    "store",
    "workspace",
  ],
  registries: ["core"],
  shared: [],
  sources: ["core", "shared", "store"],
  store: ["core", "layout", "shared"],
  workspace: ["core", "layout", "shared"],
} satisfies Record<string, readonly string[]>

type LibFolder = keyof typeof ALLOWED_DEPENDENCIES

const LIB_ROOT = join(import.meta.dirname, "..")
const LIB_IMPORT_PATTERN = /from "#lib\/(?<target>[^"]+)"/gu

const sourceFiles = readdirSync(LIB_ROOT, { recursive: true, withFileTypes: true })
  .filter(
    (entry) =>
      entry.isFile()
      && entry.name.endsWith(".ts")
      && !entry.parentPath.split(/[\\/]/u).includes("__tests__")
  )
  .map((entry) => relative(LIB_ROOT, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
  .toSorted()

const importGraph = new Map(
  sourceFiles.map((file) => [
    file,
    [...readFileSync(join(LIB_ROOT, file), "utf8").matchAll(LIB_IMPORT_PATTERN)].map(
      (match) => match.groups?.target ?? ""
    ),
  ])
)

const getFolder = (file: string) => file.split("/")[0] ?? ""

const checkIsLibFolder = (folder: string): folder is LibFolder =>
  Object.hasOwn(ALLOWED_DEPENDENCIES, folder)

describe("lib layers", () => {
  it("assigns every lib folder to a layer", () => {
    const folders = new Set(sourceFiles.map(getFolder))

    expect([...folders].filter((folder) => !checkIsLibFolder(folder))).toEqual([])
  })

  it("imports only from allowed lower layers", () => {
    const violations = [...importGraph].flatMap(([file, targets]) => {
      const folder = getFolder(file)
      const allowed: readonly string[] = checkIsLibFolder(folder)
        ? ALLOWED_DEPENDENCIES[folder]
        : []

      return targets
        .filter((target) => getFolder(target) !== folder && !allowed.includes(getFolder(target)))
        .map((target) => `${file} -> ${target}`)
    })

    expect(violations).toEqual([])
  })

  it("has no import cycles between files", () => {
    const cycles: string[] = []
    const visiting: string[] = []
    const visited = new Set<string>()

    const visit = (file: string) => {
      const cycleStart = visiting.indexOf(file)

      if (cycleStart !== -1) {
        cycles.push([...visiting.slice(cycleStart), file].join(" -> "))
        return
      }

      if (visited.has(file)) {
        return
      }

      visiting.push(file)

      for (const target of importGraph.get(file) ?? []) {
        visit(target)
      }

      visiting.pop()
      visited.add(file)
    }

    for (const file of sourceFiles) {
      visit(file)
    }

    expect(cycles).toEqual([])
  })
})
