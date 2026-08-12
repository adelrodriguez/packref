import * as Data from "effect/Data"
import type { PackageIdentity } from "#lib/core/packages.ts"
import { SUPPORTED_REGISTRIES } from "#lib/core/registry.ts"

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
    return `Failed to parse Packref lockfile at \`${this.path}\`. Fix the file or restore a valid committed copy, then retry.`
  }
}

export class ManifestParseError extends Data.TaggedError("ManifestParseError")<{
  path: string
  cause: unknown
}> {
  override get message() {
    return `Failed to read or parse package manifest at \`${this.path}\`. Check that the file is readable and contains valid JSON, then retry.`
  }
}

export class ManifestResolutionError extends Data.TaggedError("ManifestResolutionError")<{
  path: string
  cause: unknown
}> {
  override get message() {
    return `Failed to resolve installed dependency versions for \`${this.path}\`. Run your package manager's install command, or check that the manifest and lockfile are readable, then retry.`
  }
}

export class UnsupportedManifestError extends Data.TaggedError("UnsupportedManifestError")<{
  path: string
}> {
  override get message() {
    return `No supported project manifest was found in \`${this.path}\`. Packref currently supports projects with a package.json file.`
  }
}

export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  path: string
  cause: unknown
}> {
  override get message() {
    return `Failed to parse Packref config at \`${this.path}\`. Fix or remove the invalid config file, then retry.`
  }
}

export class OperationCancelled extends Data.TaggedError("OperationCancelled")<{
  reason?: string
}> {
  override get message() {
    return this.reason ?? "Operation cancelled."
  }
}

export class RequestedIntegrationError extends Data.TaggedError("RequestedIntegrationError")<{
  target: "AGENTS.md" | "tsconfig.json"
}> {
  override get message() {
    return `Requested \`${this.target}\` integration could not be completed.`
  }
}

export class NotInitializedError extends Data.TaggedError("NotInitializedError")<{
  path: string
}> {
  override get message() {
    return `Packref is not initialized in \`${this.path}\`. Run \`packref init\` first.`
  }
}

export class PackageNotReferencedError extends Data.TaggedError("PackageNotReferencedError")<{
  name: string
  registry: string
  version?: string
}> {
  override get message() {
    const identity = `${this.registry}:${this.name}${this.version === undefined ? "" : `@${this.version}`}`
    return `Package \`${identity}\` is not referenced by this project. Run \`packref list\` to see available references.`
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
    return `Unsupported registry prefix \`${this.registry}\`. Supported registries: ${SUPPORTED_REGISTRIES.join(", ")}.`
  }
}

export class PackageNotFoundError extends Data.TaggedError("PackageNotFoundError")<{
  name: string
  registry: string
}> {
  override get message() {
    return `Package \`${this.registry}:${this.name}\` was not found. Check the package name and registry, then retry.`
  }
}

export class PackageVersionNotFoundError extends Data.TaggedError("PackageVersionNotFoundError")<{
  name: string
  registry: string
  specifier: string
}> {
  override get message() {
    return `Package \`${this.registry}:${this.name}\` does not have a version matching \`${this.specifier}\`. Choose a published version or range, then retry.`
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
    return `Repository host \`${this.host}\` is not supported for source snapshots. Supported providers: GitHub, GitLab, Bitbucket, SourceHut.`
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
    return `Failed to fetch source snapshot from \`${this.source}\`. Check your network access, filesystem permissions, and available disk space, then retry.`
  }
}

export class TarballFetchError extends Data.TaggedError("TarballFetchError")<{
  cause: unknown
  url: string
}> {
  override get message() {
    return `Failed to fetch or extract package tarball from \`${this.url}\`. Check your network access, filesystem permissions, and available disk space, then retry. If the failure persists, the archive may be corrupt or unsupported.`
  }
}

export class ProjectFilesystemError extends Data.TaggedError("ProjectFilesystemError")<{
  cause: unknown
  operation: "access" | "prepare" | "resolve"
  path: string
}> {
  override get message() {
    return `Failed to ${this.operation} the project filesystem at \`${this.path}\`. Check that the path exists and that Packref has permission to access it, then retry.`
  }
}

export class PackageReferenceFilesystemError extends Data.TaggedError(
  "PackageReferenceFilesystemError"
)<{
  cause: unknown
  operation: "inspect" | "remove"
  path: string
}> {
  override get message() {
    return `Failed to ${this.operation} the package source reference at \`${this.path}\`. Check filesystem permissions and available disk space, then retry.`
  }
}

export interface PackageOperationFailure {
  readonly cause: unknown
  readonly identity: PackageIdentity
}

export class InstallPackageReferencesError extends Data.TaggedError(
  "InstallPackageReferencesError"
)<{
  failures: readonly PackageOperationFailure[]
}> {
  override get message() {
    const identities = this.failures.map(
      ({ identity }) => `${identity.registry}:${identity.name}@${identity.version}`
    )
    return `Failed to install ${this.failures.length} package source reference${this.failures.length === 1 ? "" : "s"}: ${identities.join(", ")}. Fix the reported causes, then retry; completed references were kept.`
  }
}

export class RemovePackageReferencesError extends Data.TaggedError("RemovePackageReferencesError")<{
  failures: readonly PackageOperationFailure[]
}> {
  override get message() {
    const identities = this.failures.map(
      ({ identity }) => `${identity.registry}:${identity.name}@${identity.version}`
    )
    return `Failed to remove ${this.failures.length} package source reference${this.failures.length === 1 ? "" : "s"}: ${identities.join(", ")}. Successful and already-missing references were removed from the Packref lockfile. Fix the reported causes, then retry.`
  }
}

export class GlobalStoreFilesystemError extends Data.TaggedError("GlobalStoreFilesystemError")<{
  cause: unknown
  operation: "access" | "clean" | "list" | "remove"
  path: string
}> {
  override get message() {
    return `Failed to ${this.operation} the global store filesystem at \`${this.path}\`. Check filesystem permissions and available disk space, then retry.`
  }
}

export class StoreCorruptedError extends Data.TaggedError("StoreCorruptedError")<{
  cause: unknown
  path: string
}> {
  override get message() {
    return `Failed to read valid source metadata for the global store entry at \`${this.path}\`. Check that its metadata is readable; if the metadata is missing or invalid, run \`packref clean --global\`, then retry.`
  }
}

export class StoreSourceMismatchError extends Data.TaggedError("StoreSourceMismatchError")<{
  name: string
  registry: string
  version: string
}> {
  override get message() {
    return `Global store entry for \`${this.registry}:${this.name}@${this.version}\` does not match the source recorded in packref-lock.json. Run \`packref clean --global\` and retry.`
  }
}

export class RepositoryDirectoryConflictError extends Data.TaggedError(
  "RepositoryDirectoryConflictError"
)<{
  existingDirectory?: string
  name: string
  registry: string
  requestedDirectory?: string
  version: string
}> {
  override get message() {
    const existingDirectory = this.existingDirectory ?? "the repository root"
    const requestedDirectory = this.requestedDirectory ?? "the repository root"

    return `Project already references \`${this.registry}:${this.name}@${this.version}\` from \`${existingDirectory}\` and cannot also reference \`${requestedDirectory}\` because both use the same package identity. Remove the existing package source reference before adding the requested repository directory.`
  }
}

export class ReflinkError extends Data.TaggedError("ReflinkError")<{
  cause: unknown
  source: string
  target: string
}> {
  override get message() {
    return `Failed to materialize project reference from \`${this.source}\` to \`${this.target}\`. Check that the source exists and any repository directory metadata is valid, then check filesystem permissions and available disk space before retrying.`
  }
}

export class NetworkError extends Data.TaggedError("NetworkError")<{
  cause: unknown
  url?: string
}> {
  override get message() {
    return this.url
      ? `Remote request failed for \`${this.url}\`. Check your connection, authentication, remote service status, and the response, then retry.`
      : "Remote operation failed. Check your connection, authentication, and remote service status, then retry."
  }
}
