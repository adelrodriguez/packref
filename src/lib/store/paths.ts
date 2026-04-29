import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { getPackageIdentitySegments, type PackageIdentity } from "#lib/core/packages.ts"

export const getStorePackagePath = (storeRoot: string, identity: PackageIdentity) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const segments = yield* getPackageIdentitySegments(identity)

    return path.join(storeRoot, ...segments)
  })
