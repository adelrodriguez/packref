import { constants } from "node:fs"
import { cp } from "node:fs/promises"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { ReflinkError } from "#lib/core/errors.ts"

interface ReflinkerService {
  readonly reflink: (source: string, target: string) => Effect.Effect<void, ReflinkError>
}

export class Reflinker extends Context.Service<Reflinker, ReflinkerService>()("Reflinker") {
  static readonly layerWith = (copy: typeof cp) =>
    Layer.succeed(this)({
      reflink: Effect.fn("Reflinker.reflink")(function* (source, target) {
        yield* Effect.tryPromise({
          catch: (cause) =>
            new ReflinkError({
              cause,
              source,
              target,
            }),
          try: () =>
            copy(source, target, {
              errorOnExist: true,
              force: false,
              mode: constants.COPYFILE_FICLONE,
              recursive: true,
            }),
        })
      }),
    })

  static readonly layer = this.layerWith(cp)
}
