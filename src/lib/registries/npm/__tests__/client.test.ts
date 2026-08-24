import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as TestClock from "effect/testing/TestClock"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientError from "effect/unstable/http/HttpClientError"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"
import { describe, expect, it } from "vitest"
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

  it("applies the request timeout to each retry attempt", async () => {
    let requests = 0
    const httpClientLayer = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) => {
        requests += 1

        if (requests === 1) {
          return Effect.never
        }

        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({
              "dist-tags": { latest: "1.0.0" },
              name: "example",
              versions: {
                "1.0.0": {
                  dist: {
                    tarball: "https://registry.npmjs.org/example/-/example-1.0.0.tgz",
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
        const request = yield* Effect.forkChild(client.getPackageMetadata("example"), {
          startImmediately: true,
        })

        yield* TestClock.adjust("31 seconds")
        yield* Fiber.join(request)
      }).pipe(
        Effect.provide(NpmRegistryClient.layer.pipe(Layer.provide(httpClientLayer))),
        Effect.provide(TestClock.layer())
      )
    )

    expect(requests).toBe(2)
  })

  it("retries one transient HTTP failure", async () => {
    let requests = 0
    const httpClientLayer = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) => {
        requests += 1

        if (requests === 1) {
          return Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({ request }),
            })
          )
        }

        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({
              "dist-tags": { latest: "1.0.0" },
              name: "example",
              versions: {
                "1.0.0": {
                  dist: {
                    tarball: "https://registry.npmjs.org/example/-/example-1.0.0.tgz",
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

        yield* client.getPackageMetadata("example")
      }).pipe(Effect.provide(NpmRegistryClient.layer.pipe(Layer.provide(httpClientLayer))))
    )

    expect(requests).toBe(2)
  })
})
