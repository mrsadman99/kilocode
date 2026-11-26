import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { childEnv, install, isSupported, resolve } from "../../src/kilocode/proxy"

const nativeFetch = globalThis.fetch
const servers: { stop: () => void }[] = []
const ENV_KEYS = [
  "KILO_PROXY",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "NO_PROXY",
  "no_proxy",
] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

function recordServer() {
  const hits: string[] = []
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      hits.push(req.url)
      return new Response("ok", { status: 200 })
    },
  })
  servers.push(server)
  return { hits, url: `http://127.0.0.1:${server.port}` }
}

afterEach(() => {
  globalThis.fetch = nativeFetch
  for (const server of servers.splice(0)) server.stop()
  for (const key of ENV_KEYS) {
    const value = savedEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("global proxy", () => {
  test("resolves env KILO_PROXY over the config value", () => {
    process.env.KILO_PROXY = "http://env:1"
    expect(resolve("http://cfg:2")).toBe("http://env:1")
    expect(resolve(undefined)).toBe("http://env:1")
    delete process.env.KILO_PROXY
    expect(resolve("http://cfg:2")).toBe("http://cfg:2")
    expect(resolve(undefined)).toBeUndefined()
    expect(resolve("   ")).toBeUndefined()
  })

  test("isSupported accepts http, https, and socks schemes", () => {
    expect(isSupported("http://x")).toBe(true)
    expect(isSupported("https://x")).toBe(true)
    expect(isSupported("socks5://x")).toBe(true)
    expect(isSupported("socks5h://x")).toBe(true)
    expect(isSupported("socks4://x")).toBe(true)
    expect(isSupported("socks4a://x")).toBe(true)
    expect(isSupported("localhost:5222")).toBe(false)
    expect(isSupported("ftp://x")).toBe(false)
  })

  test("routes non-loopback traffic through the proxy", async () => {
    const proxy = recordServer()
    install(proxy.url)
    const res = await fetch("http://example.invalid/path")
    expect(res.status).toBe(200)
    expect(proxy.hits).toHaveLength(1)
    expect(proxy.hits[0]).toContain("example.invalid")
  })

  test("bypasses the proxy for loopback hosts", async () => {
    const proxy = recordServer()
    const target = recordServer()
    install(proxy.url)
    const res = await fetch(`${target.url}/local`)
    expect(res.status).toBe(200)
    expect(target.hits).toHaveLength(1)
    expect(proxy.hits).toHaveLength(0)
  })

  test("honors NO_PROXY for non-loopback hosts", async () => {
    const proxy = recordServer()
    process.env.NO_PROXY = "internal.invalid"
    install(proxy.url)
    // Bypasses the proxy, so the reserved .invalid host fails direct DNS instead of hitting it.
    await expect(fetch("http://internal.invalid/direct")).rejects.toThrow()
    expect(proxy.hits).toHaveLength(0)
  })

  test("passes through a request with its own explicit proxy", async () => {
    const global = recordServer()
    const explicit = recordServer()
    install(global.url)
    const res = await fetch("http://example.invalid/", { proxy: explicit.url } as RequestInit)
    expect(res.status).toBe(200)
    expect(explicit.hits).toHaveLength(1)
    expect(global.hits).toHaveLength(0)
  })

  test("Effect FetchHttpClient routes through the proxy installed before the first request", async () => {
    const proxy = recordServer()
    // Construct the layer first (as AppRuntime does in bootstrap), then install,
    // then issue the first request — mirroring the real CLI ordering.
    const layer = FetchHttpClient.layer
    install(proxy.url)
    const status = await Effect.runPromise(
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient
        const res = yield* HttpClientRequest.get("http://effect-target.test/x").pipe(http.execute)
        return res.status
      }).pipe(Effect.provide(layer)),
    )
    expect(status).toBe(200)
    expect(proxy.hits).toContain("http://effect-target.test/x")
  })
})

describe("child process proxy env", () => {
  test("childEnv exposes the proxy to children and bypasses loopback", () => {
    const env = childEnv("http://127.0.0.1:5222")
    expect(env.HTTP_PROXY).toBe("http://127.0.0.1:5222")
    expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:5222")
    expect(env.ALL_PROXY).toBe("http://127.0.0.1:5222")
    expect(env.http_proxy).toBe("http://127.0.0.1:5222")
    expect(env.https_proxy).toBe("http://127.0.0.1:5222")
    expect(env.all_proxy).toBe("http://127.0.0.1:5222")
    expect(env.NO_PROXY).toContain("127.0.0.1")
    expect(env.NO_PROXY).toContain("localhost")
    expect(env.NO_PROXY).toContain("::1")
    expect(env.NO_PROXY).toBe(env.no_proxy)
  })

  test("childEnv preserves existing NO_PROXY entries and adds loopback", () => {
    const env = childEnv("socks5://127.0.0.1:1080", "corp.example,.internal")
    expect(env.ALL_PROXY).toBe("socks5://127.0.0.1:1080")
    expect(env.NO_PROXY).toContain("corp.example")
    expect(env.NO_PROXY).toContain(".internal")
    expect(env.NO_PROXY).toContain("localhost")
  })

  test("childEnv keeps a wildcard NO_PROXY intact", () => {
    expect(childEnv("http://x", "*").NO_PROXY).toBe("*")
  })

  test("install overrides an ambient VS Code proxy for child processes", () => {
    process.env.HTTP_PROXY = "http://vscode-wide:8080"
    process.env.HTTPS_PROXY = "http://vscode-wide:8080"
    process.env.NO_PROXY = "corp.example"
    install("http://127.0.0.1:5222")
    expect(process.env.HTTP_PROXY).toBe("http://127.0.0.1:5222")
    expect(process.env.HTTPS_PROXY).toBe("http://127.0.0.1:5222")
    expect(process.env.ALL_PROXY).toBe("http://127.0.0.1:5222")
    expect(process.env.NO_PROXY).toContain("corp.example")
    expect(process.env.NO_PROXY).toContain("127.0.0.1")
  })

  test("a spawned child inherits the Kilo proxy via modelEnv, not the ambient VS Code proxy", async () => {
    process.env.HTTP_PROXY = "http://vscode-wide:8080"
    process.env.HTTPS_PROXY = "http://vscode-wide:8080"
    install("http://127.0.0.1:5222")
    const { model } = await import("../../src/kilocode/process/env")
    const proc = Bun.spawn(["sh", "-c", 'printf "%s" "$HTTP_PROXY"'], { env: model(), stdout: "pipe" })
    const out = await new Response(proc.stdout).text()
    await proc.exited
    expect(out).toBe("http://127.0.0.1:5222")
  })
})
