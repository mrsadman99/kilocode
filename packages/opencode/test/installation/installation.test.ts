import { describe, expect } from "bun:test"
import os from "os" // kilocode_change
import { makeGlobalNode } from "@opencode-ai/core/effect/app-node"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { httpClient } from "@opencode-ai/core/effect/app-node-platform"
import { Effect, Layer, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { Installation } from "../../src/installation"
import { InstallationChannel } from "@opencode-ai/core/installation/version"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { testEffect } from "../lib/effect"

const encoder = new TextEncoder()

function mockHttpClient(handler: (request: HttpClientRequest.HttpClientRequest) => Response) {
  const client = HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))))
  return Layer.succeed(HttpClient.HttpClient, client)
}

function mockSpawner(
  // kilocode_change start
  handler: (
    cmd: string,
    args: readonly string[],
    cwd?: string,
    env?: Record<string, string | undefined>,
  ) => string | { code: number; stdout?: string; stderr?: string } = () => "",
  // kilocode_change end
) {
  const spawner = ChildProcessSpawner.make((command) => {
    const std = ChildProcess.isStandardCommand(command) ? command : undefined
    const result = handler(std?.command ?? "", std?.args ?? [], std?.options.cwd, std?.options.env) // kilocode_change
    const output = typeof result === "string" ? { code: 0, stdout: result, stderr: "" } : result
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(output.code)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: { [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId") } as any,
        stdout: output.stdout ? Stream.make(encoder.encode(output.stdout)) : Stream.empty,
        stderr: output.stderr ? Stream.make(encoder.encode(output.stderr)) : Stream.empty,
        all: Stream.empty,
        getInputFd: () => ({ [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId") }) as any,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    )
  })
  return Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function testLayer(
  httpHandler: (request: HttpClientRequest.HttpClientRequest) => Response,
  // kilocode_change start
  spawnHandler?: (
    cmd: string,
    args: readonly string[],
    cwd?: string,
    env?: Record<string, string | undefined>,
  ) => string | { code: number; stdout?: string; stderr?: string },
  // kilocode_change end
) {
  const spawnerNode = makeGlobalNode({
    service: ChildProcessSpawner.ChildProcessSpawner,
    layer: mockSpawner(spawnHandler),
    deps: [],
  })
  return LayerNode.compile(Installation.node, [
    [httpClient, mockHttpClient(httpHandler)],
    [CrossSpawnSpawner.node, spawnerNode],
  ])
}

describe("installation", () => {
  describe("latest", () => {
    // kilocode_change start - curl/unknown fallback now resolves from the public npm
    // registry instead of GitHub /releases/latest (which is polluted by JetBrains releases)
    const curlCalls: string[] = []
    testEffect(
      testLayer((request) => {
        curlCalls.push(request.url)
        return jsonResponse({ version: "1.2.3" })
      }),
    ).effect("reads release version from GitHub releases", () =>
      Effect.gen(function* () {
        const result = yield* Installation.use.latest("unknown")
        expect(result).toBe("1.2.3")
        expect(curlCalls).toContain("https://registry.npmjs.org/@kilocode%2fcli/local")
      }),
    )

    testEffect(testLayer(() => jsonResponse({ version: "4.0.0-beta.1" }))).effect(
      "strips v prefix from GitHub release tag",
      () =>
        Effect.gen(function* () {
          const result = yield* Installation.use.latest("curl")
          expect(result).toBe("4.0.0-beta.1")
        }),
    )
    // kilocode_change end

    const npmCalls: string[] = []
    testEffect(
      testLayer((request) => {
        npmCalls.push(request.url)
        return jsonResponse({ version: "1.5.0" })
      }),
    ).effect("reads npm versions via registry", () =>
      Effect.gen(function* () {
        const result = yield* Installation.use.latest("npm")
        expect(result).toBe("1.5.0")
        expect(npmCalls).toContain(`https://registry.npmjs.org/@kilocode%2fcli/${InstallationChannel}`) // kilocode_change
      }),
    )

    const bunCalls: string[] = []
    testEffect(
      testLayer((request) => {
        bunCalls.push(request.url)
        return jsonResponse({ version: "1.6.0" })
      }),
    ).effect("reads bun versions via registry", () =>
      Effect.gen(function* () {
        const result = yield* Installation.use.latest("bun")
        expect(result).toBe("1.6.0")
        expect(bunCalls).toContain(`https://registry.npmjs.org/@kilocode%2fcli/${InstallationChannel}`) // kilocode_change
      }),
    )

    const pnpmCalls: string[] = []
    testEffect(
      testLayer((request) => {
        pnpmCalls.push(request.url)
        return jsonResponse({ version: "1.7.0" })
      }),
    ).effect("reads pnpm versions via registry", () =>
      Effect.gen(function* () {
        const result = yield* Installation.use.latest("pnpm")
        expect(result).toBe("1.7.0")
        expect(pnpmCalls).toContain(`https://registry.npmjs.org/@kilocode%2fcli/${InstallationChannel}`) // kilocode_change
      }),
    )

    // kilocode_change start - a project registry without @kilocode/cli must not break version checks
    const fallbackCalls: string[] = []
    testEffect(
      testLayer((request) => {
        fallbackCalls.push(request.url)
        if (request.url.startsWith("https://registry.npmjs.org")) return jsonResponse({ version: "9.9.9" })
        return new Response("not found", { status: 404 })
      }),
    ).effect("falls back to the public registry when the configured registry fails", () =>
      Effect.gen(function* () {
        const previous = process.env.npm_config_registry
        process.env.npm_config_registry = "http://npmregistry.example/"
        const result = yield* Installation.use
          .latest("npm")
          .pipe(
            Effect.ensuring(
              Effect.sync(() => {
                if (previous == null) delete process.env.npm_config_registry
                else process.env.npm_config_registry = previous
              }),
            ),
          )
        expect(result).toBe("9.9.9")
        expect(fallbackCalls.some((url) => url.startsWith("http://npmregistry.example"))).toBe(true)
        expect(fallbackCalls).toContain(`https://registry.npmjs.org/@kilocode%2fcli/${InstallationChannel}`)
      }),
    )
    // kilocode_change end

    testEffect(testLayer(() => jsonResponse({ version: "2.3.4" }))).effect("reads scoop manifest versions", () =>
      Effect.gen(function* () {
        const result = yield* Installation.use.latest("scoop")
        expect(result).toBe("2.3.4")
      }),
    )

    testEffect(testLayer(() => jsonResponse({ d: { results: [{ Version: "3.4.5" }] } }))).effect(
      "reads chocolatey feed versions",
      () =>
        Effect.gen(function* () {
          const result = yield* Installation.use.latest("choco")
          expect(result).toBe("3.4.5")
        }),
    )

    testEffect(
      testLayer(
        () => jsonResponse({ versions: { stable: "2.0.0" } }),
        (cmd, args) => {
          // getBrewFormula: return core formula (no tap)
          if (cmd === "brew" && args.includes("--formula") && args.includes("Kilo-Org/tap/kilo")) return "" // kilocode_change
          if (cmd === "brew" && args.includes("--formula") && args.includes("kilo")) return "kilo" // kilocode_change
          return ""
        },
      ),
    ).effect("reads brew formulae API versions", () =>
      Effect.gen(function* () {
        const result = yield* Installation.use.latest("brew")
        expect(result).toBe("2.0.0")
      }),
    )

    const brewInfoJson = JSON.stringify({
      formulae: [{ versions: { stable: "2.1.0" } }],
    })
    testEffect(
      testLayer(
        () => jsonResponse({}), // HTTP not used for tap formula
        (cmd, args) => {
          if (cmd === "brew" && args.includes("Kilo-Org/tap/kilo") && args.includes("--formula")) return "kilo" // kilocode_change
          if (cmd === "brew" && args.includes("--json=v2")) return brewInfoJson
          return ""
        },
      ),
    ).effect("reads brew tap info JSON via CLI", () =>
      Effect.gen(function* () {
        const result = yield* Installation.use.latest("brew")
        expect(result).toBe("2.1.0")
      }),
    )
  })

  describe("upgrade", () => {
    // kilocode_change start - global installs must not inherit the project .npmrc registry
    for (const method of ["npm", "yarn", "pnpm", "bun"] as const) {
      let cwd: string | undefined
      testEffect(
        testLayer(
          () => jsonResponse({}),
          (cmd, _args, dir) => {
            if (cmd === method) cwd = dir
            return ""
          },
        ),
      ).effect(`runs global ${method} upgrades from the home directory`, () =>
        Effect.gen(function* () {
          yield* Installation.use.upgrade(method, "9.9.9")
          expect(cwd).toBe(os.homedir())
        }),
      )
    }

    const attempts: { env?: Record<string, string | undefined> }[] = []
    testEffect(
      testLayer(
        () => jsonResponse({}),
        (cmd, _args, _cwd, env) => {
          if (cmd !== "npm") return ""
          attempts.push({ env })
          return attempts.length === 1 ? { code: 1, stderr: "502 Bad Gateway" } : ""
        },
      ),
    ).effect("retries a failed global upgrade against the public registry", () =>
      Effect.gen(function* () {
        yield* Installation.use.upgrade("npm", "9.9.9")
        expect(attempts.length).toBe(2)
        expect(attempts.at(0)?.env?.npm_config_registry).toBeUndefined()
        expect(attempts.at(-1)?.env?.npm_config_registry).toBe("https://registry.npmjs.org/")
      }),
    )
    // kilocode_change end

    testEffect(
      testLayer(
        () => jsonResponse({}),
        (cmd) => {
          if (cmd === "npm") return { code: 1, stderr: "token=secret command output" }
          return ""
        },
      ),
    ).effect("returns sanitized typed errors for failed package upgrades", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(Installation.use.upgrade("npm", "9.9.9"))
        expect(error).toBeInstanceOf(Installation.UpgradeFailedError)
        expect(error.stderr).toBe("Upgrade failed for npm (exit code 1).")
        expect(error.message).toBe(error.stderr)
        expect(error.stderr).not.toContain("secret")
        expect(error.stderr).not.toContain("command output")
      }),
    )

    testEffect(
      testLayer(
        () => new Response("install script with token=secret", { status: 200 }),
        (cmd, args) => {
          if (cmd === "bash" && args[0] === "--version") return "GNU bash"
          if (cmd === "bash" || cmd === "sh") return { code: 1, stderr: "script output with token=secret" }
          return ""
        },
      ),
    ).effect("returns sanitized typed errors when the curl install script fails", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(Installation.use.upgrade("curl", "9.9.9"))
        expect(error).toBeInstanceOf(Installation.UpgradeFailedError)
        expect(error.stderr).toBe("Upgrade failed for curl (exit code 1).")
        expect(error.message).toBe(error.stderr)
        expect(error.stderr).not.toContain("secret")
        expect(error.stderr).not.toContain("script output")
      }),
    )

    testEffect(
      testLayer(
        () => new Response("install script", { status: 200 }),
        (cmd, args) => {
          if (cmd === "bash" && args[0] === "--version") return { code: 1, stderr: "missing" }
          if (cmd === "bash") return { code: 1, stderr: "should not execute installer with bash" }
          if (cmd === "sh") return "ok"
          return ""
        },
      ),
    ).effect("falls back to sh when bash is unavailable during curl upgrade", () =>
      Effect.gen(function* () {
        yield* Installation.use.upgrade("curl", "9.9.9")
      }),
    )
  })
})
