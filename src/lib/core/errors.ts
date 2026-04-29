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

export class NoRepositoryError extends Data.TaggedError("NoRepositoryError")<{
  name: string
  registry: string
  version: string
}> {
  override get message() {
    return `Package \`${this.registry}:${this.name}@${this.version}\` does not declare repository metadata.`
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

export class SnapshotFetchError extends Data.TaggedError("SnapshotFetchError")<{
  cause: unknown
  source: string
}> {
  override get message() {
    return `Failed to fetch source snapshot from \`${this.source}\`.`
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
