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
