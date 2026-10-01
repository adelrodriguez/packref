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
const RELATIVE_IMPORT_PATTERN = /from "(?<target>\.\.?\/[^"]*)"/gu

const sourceFiles = readdirSync(LIB_ROOT, { recursive: true, withFileTypes: true })
  .filter(
    (entry) =>
      entry.isFile()
      && entry.name.endsWith(".ts")
      && !entry.parentPath.split(/[\\/]/u).includes("__tests__")
  )
  .map((entry) => relative(LIB_ROOT, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
  .toSorted()

const sourceContents = new Map(
  sourceFiles.map((file) => [file, readFileSync(join(LIB_ROOT, file), "utf8")])
)

const importGraph = new Map(
  [...sourceContents].map(([file, contents]) => [
    file,
    [...contents.matchAll(LIB_IMPORT_PATTERN)].map((match) => match.groups?.target ?? ""),
  ])
)

const getFolder = (file: string) => file.split("/")[0] ?? ""

const findCycles = (graph: ReadonlyMap<string, readonly string[]>) => {
  const cycles: string[] = []
  const visiting: string[] = []
  const visited = new Set<string>()

  const visit = (node: string) => {
    const cycleStart = visiting.indexOf(node)

    if (cycleStart !== -1) {
      cycles.push([...visiting.slice(cycleStart), node].join(" -> "))
      return
    }

    if (visited.has(node)) {
      return
    }

    visiting.push(node)

    for (const target of graph.get(node) ?? []) {
      visit(target)
    }

    visiting.pop()
    visited.add(node)
  }

  for (const node of graph.keys()) {
    visit(node)
  }

  return cycles
}

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

  it("allows no cycles between folders", () => {
    expect(findCycles(new Map(Object.entries(ALLOWED_DEPENDENCIES)))).toEqual([])
  })

  it("uses #lib specifiers instead of relative imports", () => {
    const relativeImports = [...sourceContents].flatMap(([file, contents]) =>
      [...contents.matchAll(RELATIVE_IMPORT_PATTERN)].map(
        (match) => `${file} -> ${match.groups?.target ?? ""}`
      )
    )

    expect(relativeImports).toEqual([])
  })

  it("has no import cycles between files", () => {
    expect(findCycles(importGraph)).toEqual([])
  })
})
