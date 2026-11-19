import net from "node:net"
import tls from "node:tls"
import { once } from "node:events"
import { SocksClient } from "socks"
import { tunnelRequest } from "@kilocode/kilo-gateway/proxy-tunnel"

/**
 * Proxy-aware fetch for the extension host. SOCKS proxies use the `socks` client;
 * HTTP/HTTPS proxies use a CONNECT tunnel. Both yield a socket that the HTTP(S)
 * request is issued over, so streaming (SSE) responses keep working. With no
 * proxy, the global fetch is used.
 */
export function isSocksProxy(proxy: string): boolean {
  return /^socks/i.test(proxy)
}

export async function proxyFetch(url: string, init: RequestInit, proxy: string | undefined): Promise<Response> {
  if (!proxy) return fetch(url, init)
  const target = new URL(url)
  const secure = target.protocol === "https:"
  const port = Number(target.port) || (secure ? 443 : 80)
  const socket = isSocksProxy(proxy)
    ? await socksTunnel(proxy, target.hostname, port)
    : await connectTunnel(proxy, target.hostname, port)
  const conn = secure ? tls.connect({ socket, servername: target.hostname }) : socket
  return tunnelRequest(conn, secure, target, port, init)
}

function socksType(proxy: string): 4 | 5 {
  return /^socks4/i.test(proxy) ? 4 : 5
}

async function socksTunnel(proxy: string, host: string, port: number): Promise<net.Socket> {
  const url = new URL(proxy)
  const { socket } = await SocksClient.createConnection({
    proxy: {
      host: url.hostname,
      port: Number(url.port) || 1080,
      type: socksType(proxy),
      ...(url.username ? { userId: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    },
    command: "connect",
    destination: { host, port },
  })
  return socket
}

function readHead(socket: net.Socket): Promise<string> {
  const deferred = Promise.withResolvers<string>()
  let buf = ""
  const cleanup = () => {
    socket.removeListener("data", data)
    socket.removeListener("error", error)
    socket.removeListener("end", end)
    socket.removeListener("close", end)
  }
  const data = (chunk: Buffer) => {
    buf += chunk.toString("latin1")
    const idx = buf.indexOf("\r\n\r\n")
    if (idx < 0) return
    cleanup()
    deferred.resolve(buf.slice(0, idx))
  }
  const error = (err: Error) => {
    cleanup()
    deferred.reject(err)
  }
  const end = () => {
    cleanup()
    deferred.reject(new Error("Proxy closed connection before responding"))
  }
  socket.on("data", data)
  socket.on("error", error)
  socket.on("end", end)
  socket.on("close", end)
  return deferred.promise
}

async function connectTunnel(proxy: string, host: string, port: number): Promise<net.Socket> {
  const url = new URL(proxy)
  const secure = url.protocol === "https:"
  const proxyPort = Number(url.port) || (secure ? 443 : 80)
  const socket = secure
    ? tls.connect({ host: url.hostname, port: proxyPort, servername: url.hostname })
    : net.connect({ host: url.hostname, port: proxyPort })
  await once(socket, secure ? "secureConnect" : "connect")
  const auth = url.username
    ? `Proxy-Authorization: Basic ${Buffer.from(
        `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`,
      ).toString("base64")}\r\n`
    : ""
  socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`)
  const head = await readHead(socket).catch((err) => {
    socket.destroy()
    throw err
  })
  if (!/^HTTP\/1\.[01] 200/.test(head)) {
    socket.destroy()
    throw new Error(`Proxy CONNECT failed: ${head.split("\r\n")[0]}`)
  }
  return socket
}
