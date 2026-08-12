import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"
import { NetworkError, PackageNotFoundError } from "#lib/core/errors.ts"
import { NpmPackageMetadataSchema, type NpmPackageMetadata } from "#lib/core/npm.ts"

const NPM_REGISTRY_URL = "https://registry.npmjs.org"
const NPM_REQUEST_TIMEOUT = "30 seconds"

export interface NpmRegistryClientService {
  readonly getPackageMetadata: (
    name: string
  ) => Effect.Effect<NpmPackageMetadata, NetworkError | PackageNotFoundError>
}

const getPackageMetadataUrl = (name: string) => `${NPM_REGISTRY_URL}/${encodeURIComponent(name)}`

export class NpmRegistryClient extends Context.Service<
  NpmRegistryClient,
  NpmRegistryClientService
>()("NpmRegistryClient") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const httpClient = (yield* HttpClient.HttpClient).pipe(
        HttpClient.transformResponse(Effect.timeout(NPM_REQUEST_TIMEOUT)),
        HttpClient.retryTransient({
          schedule: Schedule.exponential("100 millis"),
          times: 1,
        })
      )

      return {
        getPackageMetadata: Effect.fn("NpmRegistryClient.getPackageMetadata")(function* (name) {
          const url = getPackageMetadataUrl(name)
          const response = yield* httpClient.get(url).pipe(
            Effect.mapError(
              (cause) =>
                new NetworkError({
                  cause,
                  url,
                })
            )
          )

          if (response.status === 404) {
            return yield* new PackageNotFoundError({
              name,
              registry: "npm",
            })
          }

          if (response.status < 200 || response.status >= 300) {
            return yield* new NetworkError({
              cause: `Unexpected npm registry status ${response.status}`,
              url,
            })
          }

          return yield* response.pipe(
            HttpClientResponse.schemaBodyJson(NpmPackageMetadataSchema),
            Effect.mapError(
              (cause) =>
                new NetworkError({
                  cause,
                  url,
                })
            )
          )
        }),
      } satisfies NpmRegistryClientService
    })
  )
}
