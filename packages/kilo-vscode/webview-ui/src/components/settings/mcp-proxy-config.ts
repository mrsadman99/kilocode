import type { McpConfig } from "../../types/messages"

export type ProxyMode = "global" | "custom" | "direct"

/** Derive the McpEditView proxy mode from a server's current config. */
export function proxyMode(cfg: Pick<McpConfig, "proxy" | "no_proxy">): ProxyMode {
  if (cfg.no_proxy) return "direct"
  if (cfg.proxy) return "custom"
  return "global"
}

export interface ProxyPatch {
  proxy: string | null
  no_proxy: boolean | null
}

/**
 * Build the `proxy`/`no_proxy` patch for a mode + URL.
 * - global: both `null`, which `configUnsetPaths` turns into explicit unsets.
 * - custom: the trimmed URL, or `null` when blank (falls back to the global proxy).
 * - direct: `no_proxy: true` with the proxy URL unset.
 */
export function proxyPatch(mode: ProxyMode, url: string): ProxyPatch {
  if (mode === "direct") return { proxy: null, no_proxy: true }
  if (mode === "custom") return { proxy: url.trim() || null, no_proxy: null }
  return { proxy: null, no_proxy: null }
}

const SUPPORTED = /^(https?|socks4a?|socks5h?):\/\//i

/** Validate the custom proxy URL; blank is allowed and means the global proxy. */
export function validateProxy(mode: ProxyMode, url: string): string | undefined {
  if (mode !== "custom") return undefined
  const value = url.trim()
  if (value && !SUPPORTED.test(value)) return "settings.agentBehaviour.editMcp.proxy.invalid"
  return undefined
}
