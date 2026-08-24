import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"
import { ProjectDependencyReader } from "#lib/manifests/index.ts"
import { PackageManagerResolver } from "#lib/manifests/javascript.ts"
import { defineManifest, type ManifestAdapter } from "#lib/manifests/manifest.ts"

const first = defineManifest({
  detect: () => Effect.succeed(true),
  name: "first",
  read: () =>
    Effect.succeed([
      {
        group: "dependencies",
        name: "effect",
        registry: "npm",
        specifier: "^4.0.0",
      },
    ]),
})

const second = defineManifest({
  detect: () => Effect.succeed(true),
  name: "second",
  read: () =>
    Effect.succeed([
      {
        group: "tool.packref.dependencies",
        name: "typescript",
        registry: "npm",
        specifier: "^7.0.0",
      },
    ]),
})

const ignored = defineManifest({
  detect: () => Effect.succeed(false),
  name: "ignored",
  read: () =>
    Effect.succeed([
      {
        group: "ignored",
        name: "ignored",
        registry: "npm",
        specifier: "1.0.0",
      },
    ]),
})

class CargoManifestError extends Error {
  override readonly name = "CargoManifestError"
}

class CargoManifestEnvironment extends Context.Service<
  CargoManifestEnvironment,
  { readonly dependencyName: string }
>()("test/CargoManifestEnvironment") {}

const readProjectDependencies = Effect.fn("test.readProjectDependencies")(function* () {
  const reader = yield* ProjectDependencyReader

  return yield* reader.readProjectDependencies("/project")
})

const readerLayer = <E, R>(adapters: ReadonlyArray<ManifestAdapter<E, R>>) =>
  ProjectDependencyReader.layerWithAdapters(adapters).pipe(
    Layer.provide(Layer.provideMerge(PackageManagerResolver.layer, NodeServices.layer))
  )

describe("ProjectDependencyReader", () => {
  it("reads every matching manifest adapter in registration order", async () => {
    const dependencies = Option.getOrThrow(
      await Effect.runPromise(
        readProjectDependencies().pipe(Effect.provide(readerLayer([first, ignored, second])))
      )
    )

    expect(dependencies.map((dependency) => dependency.name)).toEqual(["effect", "typescript"])
  })

  it("preserves adapter-defined dependency groups", async () => {
    const dependencies = Option.getOrThrow(
      await Effect.runPromise(
        readProjectDependencies().pipe(Effect.provide(readerLayer([first, second])))
      )
    )

    expect(dependencies).toEqual([
      {
        group: "dependencies",
        name: "effect",
        registry: "npm",
        specifier: "^4.0.0",
      },
      {
        group: "tool.packref.dependencies",
        name: "typescript",
        registry: "npm",
        specifier: "^7.0.0",
      },
    ])
  })

  it("accepts an adapter with foreign error and requirement types", async () => {
    const cargo = defineManifest<CargoManifestError, CargoManifestEnvironment>({
      detect: () => Effect.succeed(true),
      name: "cargo",
      read: () =>
        Effect.gen(function* () {
          const environment = yield* CargoManifestEnvironment

          if (environment.dependencyName.length === 0) {
            return yield* Effect.fail(new CargoManifestError("Missing Cargo dependency name"))
          }

          return [
            {
              group: "dependencies",
              name: environment.dependencyName,
              registry: "npm",
              specifier: "1.0.0",
            },
          ]
        }),
    })
    const layer = ProjectDependencyReader.layerWithAdapters([cargo]).pipe(
      Layer.provide(Layer.succeed(CargoManifestEnvironment)({ dependencyName: "cargo-package" }))
    )
    const dependencies = Option.getOrThrow(
      await Effect.runPromise(readProjectDependencies().pipe(Effect.provide(layer)))
    )

    expect(dependencies.map((dependency) => dependency.name)).toEqual(["cargo-package"])

    const failingLayer = ProjectDependencyReader.layerWithAdapters([cargo]).pipe(
      Layer.provide(Layer.succeed(CargoManifestEnvironment)({ dependencyName: "" }))
    )
    await expect(
      Effect.runPromise(readProjectDependencies().pipe(Effect.provide(failingLayer)))
    ).rejects.toMatchObject({
      _tag: "ManifestResolutionError",
      cause: expect.any(CargoManifestError),
      path: "/project",
    })
  })

  it("distinguishes no detected manifest from a detected empty manifest", async () => {
    const noManifest = await Effect.runPromise(
      readProjectDependencies().pipe(Effect.provide(readerLayer([ignored])))
    )
    const emptyManifest = await Effect.runPromise(
      readProjectDependencies().pipe(
        Effect.provide(
          readerLayer([
            defineManifest({
              detect: () => Effect.succeed(true),
              name: "empty",
              read: () => Effect.succeed([]),
            }),
          ])
        )
      )
    )

    expect(Option.isNone(noManifest)).toBe(true)
    expect(Option.getOrThrow(emptyManifest)).toEqual([])
  })
})
