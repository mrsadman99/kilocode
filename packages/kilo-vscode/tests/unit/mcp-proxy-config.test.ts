import { describe, expect, it } from "bun:test"
import { proxyMode, proxyPatch, validateProxy } from "../../webview-ui/src/components/settings/mcp-proxy-config"
import { mcpEditPatch } from "../../webview-ui/src/components/settings/agent-behaviour-patches"
import { configUnsetPaths } from "../../webview-ui/src/utils/config-utils"

describe("proxyMode", () => {
  it("maps an unset config to global", () => {
    expect(proxyMode({})).toBe("global")
    expect(proxyMode({ proxy: null, no_proxy: null })).toBe("global")
  })

  it("maps a proxy URL to custom", () => {
    expect(proxyMode({ proxy: "http://127.0.0.1:8080" })).toBe("custom")
  })

  it("maps no_proxy to direct, winning over a proxy URL", () => {
    expect(proxyMode({ no_proxy: true })).toBe("direct")
    expect(proxyMode({ proxy: "http://127.0.0.1:8080", no_proxy: true })).toBe("direct")
  })
})

describe("proxyPatch", () => {
  it("global unsets both keys", () => {
    expect(proxyPatch("global", "http://127.0.0.1:8080")).toEqual({ proxy: null, no_proxy: null })
  })

  it("custom keeps the trimmed URL and unsets no_proxy", () => {
    expect(proxyPatch("custom", "  socks5://127.0.0.1:1080 ")).toEqual({
      proxy: "socks5://127.0.0.1:1080",
      no_proxy: null,
    })
  })

  it("custom with a blank URL falls back to the global proxy", () => {
    expect(proxyPatch("custom", "   ")).toEqual({ proxy: null, no_proxy: null })
  })

  it("direct sets no_proxy and unsets the proxy URL", () => {
    expect(proxyPatch("direct", "http://127.0.0.1:8080")).toEqual({ proxy: null, no_proxy: true })
  })
})

describe("validateProxy", () => {
  it("skips validation outside custom mode", () => {
    expect(validateProxy("global", "nonsense")).toBeUndefined()
    expect(validateProxy("direct", "nonsense")).toBeUndefined()
  })

  it("accepts http, https, and socks schemes", () => {
    expect(validateProxy("custom", "http://127.0.0.1:8080")).toBeUndefined()
    expect(validateProxy("custom", "https://proxy.corp:443")).toBeUndefined()
    expect(validateProxy("custom", "socks4://127.0.0.1:1080")).toBeUndefined()
    expect(validateProxy("custom", "socks4a://127.0.0.1:1080")).toBeUndefined()
    expect(validateProxy("custom", "socks5://127.0.0.1:1080")).toBeUndefined()
    expect(validateProxy("custom", "socks5h://127.0.0.1:1080")).toBeUndefined()
  })

  it("allows a blank URL (means the global proxy)", () => {
    expect(validateProxy("custom", "")).toBeUndefined()
    expect(validateProxy("custom", "   ")).toBeUndefined()
  })

  it("rejects unsupported schemes and bare hosts", () => {
    expect(validateProxy("custom", "ftp://proxy")).toBeDefined()
    expect(validateProxy("custom", "localhost:1080")).toBeDefined()
    expect(validateProxy("custom", "127.0.0.1:1080")).toBeDefined()
  })
})

describe("config patch plumbing", () => {
  it("mcpEditPatch carries the proxy fields and keeps the rest of the server config", () => {
    const patch = mcpEditPatch(
      "demo",
      { type: "remote", url: "https://mcp.example/sse", timeout: 5000 },
      proxyPatch("custom", "http://127.0.0.1:8080"),
    )
    expect(patch).toEqual({
      mcp: {
        demo: {
          type: "remote",
          url: "https://mcp.example/sse",
          timeout: 5000,
          proxy: "http://127.0.0.1:8080",
          no_proxy: null,
        },
      },
    })
  })

  it("switching back to global produces explicit unset paths for both keys", () => {
    const patch = mcpEditPatch(
      "demo",
      { type: "remote", url: "https://mcp.example/sse", proxy: "http://127.0.0.1:8080" },
      proxyPatch("global", ""),
    )
    expect(configUnsetPaths(patch)).toEqual([
      ["mcp", "demo", "proxy"],
      ["mcp", "demo", "no_proxy"],
    ])
  })
})
