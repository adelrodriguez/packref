import { describe, expect, it } from "bun:test"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import { CommandRunner } from "#lib/services/command-runner.ts"

describe("CommandRunner", () => {
  it("drains stdout and stderr concurrently", async () => {
    const outputLength = 256 * 1024
    const script = `
const output = "x".repeat(${outputLength})
process.stdout.write(output)
process.stderr.write(output)
`
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const commandRunner = yield* CommandRunner

        return yield* commandRunner.run(process.execPath, ["-e", script])
      }).pipe(Effect.provide(CommandRunner.layer), Effect.provide(NodeServices.layer))
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toHaveLength(outputLength)
    expect(result.stderr).toHaveLength(outputLength)
  })
})
