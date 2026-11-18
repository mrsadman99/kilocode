import type net from "node:net"
import http from "node:http"
import https from "node:https"
import { Readable } from "node:stream"

/**
 * Issue an HTTP(S) request over an already-established tunnel socket and
 * return a standard streaming Response, so SSE providers keep working.
 * Shared by the CLI SOCKS tunnel and the extension host proxy transport.
 */
export function tunnelRequest(
  conn: net.Socket,
  secure: boolean,
  target: URL,
  port: number,
  init: RequestInit,
): Promise<Response> {
  const mod = secure ? https : http
  const headers: Record<string, string> = {}
  new Headers(init.headers).forEach((value, key) => {
    headers[key] = value
  })
  const signal = init.signal
  const deferred = Promise.withResolvers<Response>()
  let settled = false
  const fail = (err: unknown) => {
    if (settled) return
    settled = true
    signal?.removeEventListener("abort", abort)
    conn.destroy()
    deferred.reject(err)
  }
  const req = mod.request(
    {
      hostname: target.hostname,
      port,
      path: target.pathname + target.search,
      method: init.method ?? "GET",
      headers,
      createConnection: () => conn,
    },
    (res) => {
      if (settled) return
      settled = true
      const head = new Headers()
      for (const [key, value] of Object.entries(res.headers)) {
        if (value === undefined) continue
        if (Array.isArray(value)) value.forEach((item) => head.append(key, item))
        else head.set(key, String(value))
      }
      deferred.resolve(
        new Response(Readable.toWeb(res) as unknown as ReadableStream, {
          status: res.statusCode ?? 200,
          headers: head,
        }),
      )
    },
  )
  // Kept after resolve on purpose: aborting mid-body must destroy the request
  // so streaming (SSE) consumers see the cancellation.
  const abort = () => {
    req.destroy()
    fail(signal?.reason ?? new DOMException("The operation was aborted.", "AbortError"))
  }
  req.on("error", fail)
  conn.on("error", fail)

  if (signal) {
    if (signal.aborted) {
      req.destroy()
      fail(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"))
      return deferred.promise
    }
    signal.addEventListener("abort", abort, { once: true })
  }

  const body = init.body
  if (body == null) {
    req.end()
    return deferred.promise
  }
  if (typeof body === "string" || body instanceof Uint8Array) {
    req.end(body)
    return deferred.promise
  }
  if (body instanceof ReadableStream) {
    Readable.fromWeb(body as unknown as import("node:stream/web").ReadableStream).pipe(req)
    return deferred.promise
  }
  req.end(String(body))
  return deferred.promise
}
