import type * as Path from "effect/Path"

export const checkIsPathWithin = (path: Path.Path, root: string, candidate: string) => {
  const relativePath = path.relative(root, candidate)

  return (
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  )
}
