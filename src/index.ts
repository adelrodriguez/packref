import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Runtime from "effect/Runtime"
import * as Command from "effect/unstable/cli/Command"
import add from "#commands/add.ts"
import clean from "#commands/clean.ts"
import init from "#commands/init.ts"
import install from "#commands/install.ts"
import list from "#commands/list.ts"
import prune from "#commands/prune.ts"
import remove from "#commands/remove.ts"
import sync from "#commands/sync.ts"
import { ProjectDependencyReader } from "#lib/manifests/index.ts"
import { PackageManagerResolver } from "#lib/manifests/javascript.ts"
import { PackageManagerDetector } from "#lib/manifests/package-manager-detector.ts"
import { NpmRegistryClient } from "#lib/registries/npm/client.ts"
import { RepositoryDownloader } from "#lib/sources/repository/fetch.ts"
import { RemoteTagReader } from "#lib/sources/repository/tags.ts"
import { Reflinker } from "#lib/workspace/reflinker.ts"
import { Prompter } from "#terminal/prompter.ts"
import { getPackageVersion } from "#version.macro.ts" with { type: "macro" }

const main = Command.make("packref").pipe(
  Command.withDescription("Local, versioned package references for your agents"),
  Command.withSubcommands([add, clean, init, install, list, prune, remove, sync])
)

const version = await getPackageVersion()

const NodePlatform = Layer.mergeAll(NodeHttpClient.layerFetch, NodeServices.layer)
const PackageManagerServices = PackageManagerResolver.layer.pipe(
  Layer.provide(PackageManagerDetector.layer)
)
const ManifestServices = Layer.provideMerge(
  ProjectDependencyReader.layer,
  Layer.provideMerge(PackageManagerServices, NodePlatform)
)
const PackrefServices = Layer.mergeAll(
  NpmRegistryClient.layer,
  ManifestServices,
  Prompter.layer,
  Reflinker.layer,
  RemoteTagReader.layer,
  RepositoryDownloader.layer
)

const AppLayer = Layer.provideMerge(PackrefServices, NodePlatform)

const program = Command.run(main, { version }).pipe(
  Effect.as(0),
  Effect.catchTag("ShowHelp", (error) => Effect.succeed(error.errors.length === 0 ? 0 : 1)),
  Effect.catch((error) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter

      yield* prompter.log.error(error.message)

      return 1
    })
  ),
  Effect.provide(AppLayer)
)

NodeRuntime.runMain(program, {
  teardown: (exit, onExit) => {
    if (Exit.isSuccess(exit)) {
      onExit(Number(exit.value))
      return
    }

    Runtime.defaultTeardown(exit, onExit)
  },
})
