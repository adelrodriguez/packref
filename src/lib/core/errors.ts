import * as Data from "effect/Data"

export class MissingPackageVersion extends Data.TaggedError("MissingPackageVersion")<{
  path?: string
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "package.json"
    return `Missing version field in ${target}.`
  }
}

export class LockfileParseError extends Data.TaggedError("LockfileParseError")<{
  path: string
  cause: unknown
}> {
  override get message() {
    return `Failed to parse Packref lockfile at \`${this.path}\`.`
  }
}

export class ManifestParseError extends Data.TaggedError("ManifestParseError")<{
  path: string
  cause: unknown
}> {
  override get message() {
    return `Failed to parse project manifest at \`${this.path}\`.`
  }
}

export class ManifestResolutionError extends Data.TaggedError("ManifestResolutionError")<{
  path: string
  cause: unknown
}> {
  override get message() {
    return `Failed to resolve installed dependency versions for \`${this.path}\`.`
  }
}

export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  path: string
  cause: unknown
}> {
  override get message() {
    return `Failed to parse Packref config at \`${this.path}\`.`
  }
}

export class OperationCancelled extends Data.TaggedError("OperationCancelled")<{
  reason?: string
}> {
  override get message() {
    return this.reason ?? "Operation cancelled."
  }
}

export class InvalidPackageIdentity extends Data.TaggedError("InvalidPackageIdentity")<{
  field: "name" | "registry" | "version"
  reason: string
  value: string
}> {
  override get message() {
    return `Invalid package identity ${this.field} \`${this.value}\`: ${this.reason}.`
  }
}

export class UnsupportedRegistryError extends Data.TaggedError("UnsupportedRegistryError")<{
  registry: string
}> {
  override get message() {
    return `Unsupported registry prefix \`${this.registry}\`.`
  }
}

export class PackageNotFoundError extends Data.TaggedError("PackageNotFoundError")<{
  name: string
  registry: string
}> {
  override get message() {
    return `Package \`${this.registry}:${this.name}\` was not found.`
  }
}

export class PackageVersionNotFoundError extends Data.TaggedError("PackageVersionNotFoundError")<{
  name: string
  registry: string
  specifier: string
}> {
  override get message() {
    return `Package \`${this.registry}:${this.name}\` does not have a version matching \`${this.specifier}\`.`
  }
}

export class InvalidRepositoryUrlError extends Data.TaggedError("InvalidRepositoryUrlError")<{
  reason: string
  url: string
}> {
  override get message() {
    return `Invalid repository URL \`${this.url}\`: ${this.reason}.`
  }
}

export class UnsupportedRepositoryHostError extends Data.TaggedError(
  "UnsupportedRepositoryHostError"
)<{
  host: string
  url: string
}> {
  override get message() {
    return `Repository host \`${this.host}\` is not supported for source snapshots.`
  }
}

export class TagNotFoundError extends Data.TaggedError("TagNotFoundError")<{
  repository: string
  version: string
}> {
  override get message() {
    return `Could not find a matching git tag for version \`${this.version}\` in \`${this.repository}\`.`
  }
}

export class GitExecutableNotFoundError extends Data.TaggedError("GitExecutableNotFoundError")<{
  cause: unknown
  command: string
}> {
  override get message() {
    return `Could not run \`${this.command}\`. Install Git and ensure it is available on PATH.`
  }
}

export class SnapshotFetchError extends Data.TaggedError("SnapshotFetchError")<{
  cause: unknown
  source: string
}> {
  override get message() {
    return `Failed to fetch source snapshot from \`${this.source}\`.`
  }
}

export class TarballFetchError extends Data.TaggedError("TarballFetchError")<{
  cause: unknown
  url: string
}> {
  override get message() {
    return `Failed to fetch or extract package tarball from \`${this.url}\`.`
  }
}

export class StoreCorruptedError extends Data.TaggedError("StoreCorruptedError")<{
  cause: unknown
  path: string
}> {
  override get message() {
    return `Global store entry at \`${this.path}\` is missing valid source metadata.`
  }
}

export class ReflinkError extends Data.TaggedError("ReflinkError")<{
  cause: unknown
  source: string
  target: string
}> {
  override get message() {
    return `Failed to materialize project reference from \`${this.source}\` to \`${this.target}\`.`
  }
}

export class NetworkError extends Data.TaggedError("NetworkError")<{
  cause: unknown
  url?: string
}> {
  override get message() {
    return this.url ? `Network request failed for \`${this.url}\`.` : "Network request failed."
  }
}
