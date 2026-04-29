import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse"
import { NetworkError, PackageNotFoundError } from "#lib/core/errors.ts"
import { NpmPackageMetadataSchema, type NpmPackageMetadata } from "#lib/registries/npm/metadata.ts"

const NPM_REGISTRY_URL = "https://registry.npmjs.org"

export interface NpmRegistryClientService {
  readonly getPackageMetadata: (
    name: string
  ) => Effect.Effect<NpmPackageMetadata, NetworkError | PackageNotFoundError>
}

const getPackageMetadataUrl = (name: string) =>
  `${NPM_REGISTRY_URL}/${name
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`

export class NpmRegistryClient extends Context.Service<
  NpmRegistryClient,
  NpmRegistryClientService
>()("NpmRegistryClient") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const httpClient = yield* HttpClient.HttpClient

      return {
        getPackageMetadata: (name) =>
          Effect.gen(function* () {
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
