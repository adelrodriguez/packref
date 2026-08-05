import { homedir } from "node:os"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

interface PackrefHomeService {
  readonly path: string
}

export class PackrefHome extends Context.Service<PackrefHome, PackrefHomeService>()("PackrefHome") {
  static readonly layer = Layer.effect(
    this,
    Effect.sync(() => ({ path: homedir() }))
  )

  static at(path: string) {
    return Layer.succeed(this)({ path })
  }
}
