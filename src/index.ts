import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Runtime from "effect/Runtime"
import * as Command from "effect/unstable/cli/Command"
import addCommand from "#commands/add.ts"
import initCommand from "#commands/init.ts"
import listCommand from "#commands/list.ts"
import pruneCommand from "#commands/prune.ts"
import removeCommand from "#commands/remove.ts"
import { getPackageVersion } from "#version.ts" with { type: "macro" }

const main = Command.make("packref").pipe(
  Command.withDescription("Local, versioned package references for your agents"),
  Command.withSubcommands([addCommand, initCommand, listCommand, pruneCommand, removeCommand])
)

const version = await getPackageVersion()

const program = Command.run(main, { version }).pipe(
  Effect.as(0),
  Effect.catch((error) => Effect.logError(error.message).pipe(Effect.as(1))),
  Effect.provide(Layer.mergeAll(NodeServices.layer))
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
