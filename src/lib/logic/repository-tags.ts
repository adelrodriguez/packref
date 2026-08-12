import * as Array from "effect/Array"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import type { PackageIdentity } from "#lib/core/packages.ts"
import type { RemoteRepositoryRefs } from "#lib/core/repository.ts"

const HEADS_PREFIX = "refs/heads/"
const TAGS_PREFIX = "refs/tags/"

export const parseGitRemoteRefsOutput = (output: string): RemoteRepositoryRefs => {
  let head: string | undefined
  const heads = new Map<string, string>()
  const tags = new Map<string, string>()

  for (const rawLine of output.split(/\r?\n/u)) {
    const [sha, ref] = rawLine.trim().split(/\s+/u)

    if (sha === undefined || ref === undefined) continue
    if (ref === "HEAD") head = sha
    else if (ref.startsWith(HEADS_PREFIX)) heads.set(ref.slice(HEADS_PREFIX.length), sha)
    else if (ref.startsWith(TAGS_PREFIX)) {
      const tag = ref.slice(TAGS_PREFIX.length).replace(/\^\{\}$/u, "")
      tags.set(tag, sha)
    }
  }

  return { head, heads, tags }
}

export const parseGitRemoteTagsOutput = (output: string) =>
  pipe(
    output.split(/\r?\n/u),
    Array.filterMap((rawLine) => {
      const line = rawLine.trim()

      if (line.length === 0) return Result.failVoid

      const ref = line.split(/\s+/u).at(-1)

      if (ref === undefined || !ref.startsWith(TAGS_PREFIX)) return Result.failVoid

      const tag = ref.slice(TAGS_PREFIX.length).replace(/\^\{\}$/u, "")

      return tag.length > 0 ? Result.succeed(tag) : Result.failVoid
    }),
    Array.dedupe
  )

export const getTagCandidates = ({ name, version }: PackageIdentity) => [
  `v${version}`,
  version,
  `${name}@${version}`,
]

export const matchRepositoryTag = (identity: PackageIdentity, availableTags: readonly string[]) => {
  const availableTagSet = new Set(availableTags)

  return Option.fromNullishOr(
    getTagCandidates(identity).find((candidate) => availableTagSet.has(candidate))
  )
}
