import * as Log from "@opencode-ai/core/util/log"
import { isSocks, socksFetch } from "@/kilocode/provider/proxy"

const log = Log.create({ service: "kilocode.proxy" })

/** Proxy URL with any userinfo credentials stripped, safe to log. */
function label(proxy: string): string {
  const parsed = URL.parse(proxy)
  return parsed ? `${parsed.protocol}//${parsed.host}` : proxy
}

/**
 * Global outbound proxy for the CLI process.
 *
 * A single proxy URL (http, https, socks4/4a/5/5h) is resolved from the
 * `KILO_PROXY` environment variable (set by the VS Code extension from its
 * `kilo-code.new.proxy` setting) or the top-level `proxy` config key. It is
 * installed as a wrapper around `globalThis.fetch`, so every in-process HTTP
 * client — plain `fetch`, Effect's `FetchHttpClient`, the MCP SDK transports,
 * PostHog, the AI SDK providers, and the marketplace/gateway fetchers — routes
 * through it without per-callsite changes.
 *
 * Loopback traffic (the extension<->backend and TUI<->server connections) and
 * hosts listed in NO_PROXY are never proxied. A request that already sets its
 * own `proxy` in its `RequestInit` (a per-provider `options.proxy`) passes
 * through unchanged so the provider-specific proxy wins over the global one.
 *
 * The proxy is also exported into the process environment (HTTP_PROXY,
 * HTTPS_PROXY, ALL_PROXY and lowercase variants) so child processes spawned by
 * Kilo — MCP servers launched via npx/uvx/docker, shell commands, plugin
 * installs — use it too, overriding any ambient VS Code `http.proxy`. NO_PROXY
 * is extended with loopback hosts so local traffic stays direct. SOCKS URLs are
 * honored by socks-aware children (curl, uv, python); Node-based children have
 * limited SOCKS support.
 */

export const ENV = "KILO_PROXY"

const SUPPORTED = /^(https?|socks4a?|socks5h?):\/\//i

let original: typeof fetch | undefined

/** Resolve the effective proxy from env and config, preferring env. */
export function resolve(configProxy: string | undefined): string | undefined {
  const env = process.env[ENV]
  const value = env && env.trim() !== "" ? env.trim() : (configProxy ?? "").trim()
  return value === "" ? undefined : value
}

export function isSupported(proxy: string): boolean {
  return SUPPORTED.test(proxy)
}

function urlOf(input: RequestInfo | URL): string | undefined {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  if (input instanceof Request) return input.url
  return undefined
}

function isLoopback(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "")
  return (
    bare === "" ||
    bare === "localhost" ||
    bare === "::1" ||
    bare === "0.0.0.0" ||
    /^127\./.test(bare)
  )
}

function noProxyBypasses(host: string, port: number): boolean {
  const raw = process.env.no_proxy ?? process.env.NO_PROXY
  if (!raw) return false
  if (raw.trim() === "*") return true
  for (const item of raw.split(",")) {
    const entry = item.trim()
    if (entry === "") continue
    const match = entry.match(/^(.+):(\d+)$/)
    const hostPart = (match ? match[1] : entry).toLowerCase()
    const portPart = match ? Number(match[2]) : undefined
    if (portPart !== undefined && portPart !== port) continue
    if (hostPart === "*") return true
    if (hostPart.startsWith(".")) {
      if (host === hostPart.slice(1) || host.endsWith(hostPart)) return true
      continue
    }
    if (host === hostPart || host.endsWith(`.${hostPart}`)) return true
  }
  return false
}

function isBypassed(url: string): boolean {
  const parsed = URL.parse(url)
  if (!parsed) return false
  const host = parsed.hostname.toLowerCase()
  if (isLoopback(host)) return true
  return noProxyBypasses(host, Number(parsed.port) || 0)
}

/** Existing NO_PROXY entries plus loopback hosts, so local traffic stays direct. */
function noProxyWithLoopback(existing: string | undefined): string {
  const base = (existing ?? "").trim()
  if (base === "*") return "*"
  const entries = base === "" ? [] : base.split(",").map((item) => item.trim()).filter((item) => item !== "")
  for (const host of ["127.0.0.1", "localhost", "::1"]) {
    if (!entries.includes(host)) entries.push(host)
  }
  return entries.join(",")
}

/**
 * Environment handed to child processes so they route through the Kilo proxy
 * rather than any ambient (VS Code `http.proxy`) proxy. Exported for testing.
 */
export function childEnv(proxy: string, noProxy?: string): Record<string, string> {
  const merged = noProxyWithLoopback(noProxy)
  return {
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    ALL_PROXY: proxy,
    http_proxy: proxy,
    https_proxy: proxy,
    all_proxy: proxy,
    NO_PROXY: merged,
    no_proxy: merged,
  }
}

/** Install the global fetch wrapper. Idempotent; wraps the native fetch, not a prior wrapper. */
export function install(proxy: string | undefined): void {
  if (!proxy) return
  if (!isSupported(proxy)) {
    log.warn("ignoring proxy with unsupported scheme; expected http, https, or socks", { proxy: label(proxy) })
    return
  }
  if (original === undefined) original = globalThis.fetch
  const native = original
  const socks = isSocks(proxy)
  Object.assign(process.env, childEnv(proxy, process.env.NO_PROXY ?? process.env.no_proxy))
  log.info("global outbound proxy installed", { proxy: label(proxy) })

  const wrapped = ((input: RequestInfo | URL, init?: RequestInit) => {
    if ((init as { proxy?: unknown } | undefined)?.proxy) return native(input, init)
    const url = urlOf(input)
    if (url && isBypassed(url)) return native(input, init)
    if (socks) return socksFetch(proxy, input, init)
    return native(input, { ...init, proxy })
  }) as typeof fetch

  Object.assign(wrapped, native)
  globalThis.fetch = wrapped
}
