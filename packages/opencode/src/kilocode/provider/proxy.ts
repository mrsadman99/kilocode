import tls from "node:tls"
import { SocksClient } from "socks"
import { tunnelRequest } from "@kilocode/kilo-gateway/proxy-tunnel"

// SOCKS proxies cannot be handled by Bun's native fetch `proxy` option (it only
// accepts http/https), so they are tunneled manually here.
export function isSocks(proxy: string) {
  return /^socks/i.test(proxy)
}

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * Wrap fetch so every request routes through the configured proxy. HTTP/HTTPS
 * proxies use Bun's native `proxy` option; SOCKS proxies use the manual tunnel.
 * With no proxy, the global fetch is returned unchanged.
 */
export function proxiedFetch(proxy: string | undefined): FetchFn {
  if (!proxy) return fetch
  if (isSocks(proxy)) return (input, init) => socksFetch(proxy, input, init)
  return (input, init) => fetch(input, { ...init, proxy })
}

function socksType(proxy: string): 4 | 5 {
  return /^socks4/i.test(proxy) ? 4 : 5
}

/**
 * Perform a fetch through a SOCKS4/5 proxy by establishing a tunnel with the
 * `socks` client and issuing the HTTP(S) request over the resulting socket.
 * Returns a standard streaming Response so SSE providers keep working.
 */
export async function socksFetch(proxy: string, input: unknown, init?: RequestInit): Promise<Response> {
  const target = new URL(input instanceof Request ? input.url : String(input))
  const secure = target.protocol === "https:"
  const port = Number(target.port) || (secure ? 443 : 80)
  const url = new URL(proxy)
  const method = init?.method ?? (input instanceof Request ? input.method : "GET")
  const body = init?.body ?? (input instanceof Request ? input.body : undefined)
  const headers = init?.headers ?? (input instanceof Request ? input.headers : undefined)

  const { socket } = await SocksClient.createConnection({
    proxy: {
      host: url.hostname,
      port: Number(url.port) || 1080,
      type: socksType(proxy),
      ...(url.username ? { userId: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    },
    command: "connect",
    destination: { host: target.hostname, port },
  })

  const conn = secure ? tls.connect({ socket, servername: target.hostname }) : socket
  return tunnelRequest(conn, secure, target, port, { ...init, method, body, headers })
}
