import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Layer from "effect/Layer"
import { describe, expect, it } from "vitest"
import { userAgentLayer } from "#lib/shared/http.ts"

describe("userAgentLayer", () => {
  it("identifies packref and its version on every request", async () => {
    let userAgent: string | undefined
    const httpClientLayer = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) => {
        userAgent = request.headers["user-agent"]

        return Effect.succeed(HttpClientResponse.fromWeb(request, new Response()))
      })
    )

    await Effect.runPromise(
      HttpClient.get("https://index.crates.io/config.json").pipe(
        Effect.provide(userAgentLayer("1.2.3").pipe(Layer.provide(httpClientLayer)))
      )
    )

    expect(userAgent).toBe("packref/1.2.3 (+https://github.com/adelrodriguez/packref)")
  })
})
