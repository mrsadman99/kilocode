import { childEnv, isSupported } from "@/kilocode/proxy"
import { directFetch, proxiedFetch, type FetchFn } from "@/kilocode/provider/proxy"

export interface ProxyOptions {
  proxy?: string
  no_proxy?: boolean
}

const PROXY_KEYS = Object.keys(childEnv("")).filter((key) => key.toUpperCase() !== "NO_PROXY")

/** Validation error for an unsupported per-server proxy URL, otherwise undefined. */
export function proxyError(mcp: ProxyOptions): string | undefined {
  if (mcp.no_proxy) return undefined
  const proxy = mcp.proxy?.trim()
  if (!proxy) return undefined
  if (!isSupported(proxy)) return "Invalid MCP proxy: expected an http, https, or socks URL"
  return undefined
}

/**
 * Fetch for a remote MCP server: direct (`no_proxy`), a per-server proxy
 * override, or the current global fetch (itself wrapped when a global proxy is
 * installed). `no_proxy` wins over `proxy`. The direct path dials the target
 * itself because Bun's native fetch would still honor proxy env variables.
 */
export function serverFetch(mcp: ProxyOptions): FetchFn {
  if (mcp.no_proxy) return directFetch
  const proxy = mcp.proxy?.trim()
  if (proxy && isSupported(proxy)) return proxiedFetch(proxy)
  return fetch
}

/**
 * Environment for a local MCP server process. A per-server `proxy` overrides
 * the inherited global proxy variables; `no_proxy` strips them and bypasses
 * everything so the child connects directly. Children that ignore proxy
 * environment variables (some Node-based servers) are unaffected either way.
 */
export function localEnv(mcp: ProxyOptions, base: Record<string, string>): Record<string, string> {
  if (mcp.no_proxy) {
    const env = { ...base }
    for (const key of PROXY_KEYS) delete env[key]
    env.NO_PROXY = "*"
    env.no_proxy = "*"
    return env
  }
  const proxy = mcp.proxy?.trim()
  if (proxy && isSupported(proxy)) return { ...base, ...childEnv(proxy, base.NO_PROXY ?? base.no_proxy) }
  return base
}
