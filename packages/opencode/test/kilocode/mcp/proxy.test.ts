import { afterEach, describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"
import { install } from "../../../src/kilocode/proxy"
import { directFetch } from "../../../src/kilocode/provider/proxy"
import { localEnv, proxyError, serverFetch } from "../../../src/kilocode/mcp/proxy"
import { model } from "../../../src/kilocode/process/env"

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

describe("mcp config schema", () => {
  test("remote accepts proxy and no_proxy", () => {
    const cfg = Schema.decodeUnknownSync(ConfigMCPV1.Remote)({
      type: "remote",
      url: "https://mcp.example/sse",
      proxy: "socks5://127.0.0.1:1080",
      no_proxy: true,
    })
    expect(cfg.proxy).toBe("socks5://127.0.0.1:1080")
    expect(cfg.no_proxy).toBe(true)
  })

  test("local normalizes proxy and no_proxy alongside the env alias", () => {
    const cfg = Schema.decodeUnknownSync(ConfigMCPV1.Local)({
      type: "local",
      command: ["npx", "some-mcp"],
      env: { TOKEN: "x" },
      proxy: "http://127.0.0.1:8080",
      no_proxy: false,
    })
    expect(cfg.environment).toEqual({ TOKEN: "x" })
    expect(cfg.proxy).toBe("http://127.0.0.1:8080")
    expect(cfg.no_proxy).toBe(false)
  })

  test("both remain optional", () => {
    const remote = Schema.decodeUnknownSync(ConfigMCPV1.Remote)({ type: "remote", url: "https://mcp.example" })
    expect(remote.proxy).toBeUndefined()
    expect(remote.no_proxy).toBeUndefined()
  })
})

describe("proxyError", () => {
  test("accepts supported schemes and empty values", () => {
    expect(proxyError({})).toBeUndefined()
    expect(proxyError({ proxy: "  " })).toBeUndefined()
    expect(proxyError({ proxy: "http://127.0.0.1:8080" })).toBeUndefined()
    expect(proxyError({ proxy: "socks5h://127.0.0.1:1080" })).toBeUndefined()
  })

  test("rejects unsupported schemes", () => {
    expect(proxyError({ proxy: "ftp://proxy" })).toBeDefined()
    expect(proxyError({ proxy: "localhost:1080" })).toBeDefined()
  })

  test("no_proxy skips proxy validation", () => {
    expect(proxyError({ proxy: "nonsense", no_proxy: true })).toBeUndefined()
  })
})

describe("serverFetch", () => {
  test("directFetch ignores the installed proxy and its env variables", async () => {
    const proxy = recordServer()
    const target = recordServer()
    install(proxy.url)
    const res = await directFetch(`${target.url}/local`)
    expect(res.status).toBe(200)
    expect(target.hits).toHaveLength(1)
    expect(proxy.hits).toHaveLength(0)
  })

  test("without an override the global proxy still applies", async () => {
    const proxy = recordServer()
    install(proxy.url)
    const res = await serverFetch({})("http://example.invalid/path")
    expect(res.status).toBe(200)
    expect(proxy.hits).toHaveLength(1)
  })

  test("no_proxy bypasses the installed global proxy", async () => {
    const proxy = recordServer()
    install(proxy.url)
    // Direct DNS for the reserved .invalid host fails instead of hitting the proxy.
    await expect(serverFetch({ no_proxy: true })("http://example.invalid/direct")).rejects.toThrow()
    expect(proxy.hits).toHaveLength(0)
  })

  test("a per-server proxy overrides the global one", async () => {
    const global = recordServer()
    const override = recordServer()
    install(global.url)
    const res = await serverFetch({ proxy: override.url })("http://example.invalid/path")
    expect(res.status).toBe(200)
    expect(override.hits).toHaveLength(1)
    expect(global.hits).toHaveLength(0)
  })

  test("no_proxy wins over a proxy override", async () => {
    const global = recordServer()
    const override = recordServer()
    install(global.url)
    await expect(serverFetch({ proxy: override.url, no_proxy: true })("http://example.invalid/")).rejects.toThrow()
    expect(override.hits).toHaveLength(0)
    expect(global.hits).toHaveLength(0)
  })
})

describe("localEnv", () => {
  const base = {
    HTTP_PROXY: "http://global:1",
    HTTPS_PROXY: "http://global:1",
    ALL_PROXY: "http://global:1",
    http_proxy: "http://global:1",
    https_proxy: "http://global:1",
    all_proxy: "http://global:1",
    NO_PROXY: "corp.example",
    no_proxy: "corp.example",
    TOKEN: "keep",
  }

  test("without an override the env passes through unchanged", () => {
    expect(localEnv({}, base)).toEqual(base)
  })

  test("a per-server proxy replaces the inherited proxy variables", () => {
    const env = localEnv({ proxy: "socks5://127.0.0.1:1080" }, base)
    expect(env.HTTP_PROXY).toBe("socks5://127.0.0.1:1080")
    expect(env.HTTPS_PROXY).toBe("socks5://127.0.0.1:1080")
    expect(env.ALL_PROXY).toBe("socks5://127.0.0.1:1080")
    expect(env.http_proxy).toBe("socks5://127.0.0.1:1080")
    expect(env.NO_PROXY).toContain("corp.example")
    expect(env.NO_PROXY).toContain("localhost")
    expect(env.TOKEN).toBe("keep")
  })

  test("no_proxy strips every proxy variable and bypasses all hosts", () => {
    const env = localEnv({ no_proxy: true }, base)
    for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
      expect(env[key]).toBeUndefined()
    }
    expect(env.NO_PROXY).toBe("*")
    expect(env.no_proxy).toBe("*")
    expect(env.TOKEN).toBe("keep")
  })

  test("no_proxy wins over a proxy override", () => {
    const env = localEnv({ proxy: "http://other:2", no_proxy: true }, base)
    expect(env.HTTP_PROXY).toBeUndefined()
    expect(env.NO_PROXY).toBe("*")
  })

  test("composes with modelEnv after a global install", () => {
    const proxy = recordServer()
    install(proxy.url)
    const direct = localEnv({ no_proxy: true }, model())
    expect(direct.HTTP_PROXY).toBeUndefined()
    expect(direct.NO_PROXY).toBe("*")
    const override = localEnv({ proxy: "http://other:2" }, model())
    expect(override.HTTP_PROXY).toBe("http://other:2")
  })
})
