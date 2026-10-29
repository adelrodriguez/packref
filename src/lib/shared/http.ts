import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Layer from "effect/Layer"

export const userAgentLayer = (version: string) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      const httpClient = yield* HttpClient.HttpClient

      return HttpClient.mapRequest(
        httpClient,
        HttpClientRequest.setHeader(
          "user-agent",
          `packref/${version} (+https://github.com/adelrodriguez/packref)`
        )
      )
    })
  )
