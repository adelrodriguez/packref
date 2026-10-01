import { homedir } from "node:os"
import * as Context from "effect/Context"
import * as Layer from "effect/Layer"

interface PackrefHomeValue {
  readonly path: string
}

export class PackrefHome extends Context.Reference<PackrefHomeValue>("PackrefHome", {
  defaultValue: () => ({ path: homedir() }),
}) {
  static at(path: string) {
    return Layer.succeed(this, { path })
  }
}
