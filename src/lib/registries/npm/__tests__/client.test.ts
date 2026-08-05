import { describe, expect, it } from "bun:test"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"
import { NpmRegistryClient } from "#lib/registries/npm/client.ts"

describe("NpmRegistryClient", () => {
  it("encodes the full scoped package name in metadata requests", async () => {
    let requestedUrl: string | undefined
    const httpClientLayer = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) => {
        requestedUrl = request.url

        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({
              "dist-tags": { latest: "1.0.0" },
              name: "@scope/example",
              versions: {
                "1.0.0": {
                  dist: {
                    tarball: "https://registry.npmjs.org/@scope/example/-/example-1.0.0.tgz",
                  },
                  version: "1.0.0",
                },
              },
            })
          )
        )
      })
    )

    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* NpmRegistryClient

        yield* client.getPackageMetadata("@scope/example")
      }).pipe(Effect.provide(NpmRegistryClient.layer.pipe(Layer.provide(httpClientLayer))))
    )

    expect(requestedUrl).toBe("https://registry.npmjs.org/%40scope%2Fexample")
  })
})
