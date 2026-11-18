import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { proxyFetch, isSocksProxy } from "../../src/shared/proxy-fetch"

function socksServer(onConnect: () => void) {
  return Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(s) {
        s.data = { stage: "greet", buf: Buffer.alloc(0), up: null as Promise<any> | null }
      },
      data(s, chunk) {
        const d = s.data
        d.buf = Buffer.concat([d.buf, chunk])
        if (d.stage === "greet") {
          if (d.buf.length < 2) return
          const n = d.buf[1]
          if (d.buf.length < 2 + n) return
          d.buf = d.buf.subarray(2 + n)
          s.write(Buffer.from([5, 0]))
          d.stage = "req"
          return
        }
        if (d.stage === "req") {
          if (d.buf.length < 5) return
          const atyp = d.buf[3]
          let host: string
          let off: number
          if (atyp === 1) {
            if (d.buf.length < 10) return
            host = [...d.buf.subarray(4, 8)].join(".")
            off = 8
          } else if (atyp === 3) {
            const len = d.buf[4]
            if (d.buf.length < 5 + len + 2) return
            host = d.buf.subarray(5, 5 + len).toString()
            off = 5 + len
          } else {
            s.end()
            return
          }
          const port = d.buf.readUInt16BE(off)
          const rest = d.buf.subarray(off + 2)
          d.buf = Buffer.alloc(0)
          d.stage = "relay"
          onConnect()
          d.up = Bun.connect({
            hostname: host,
            port,
            socket: {
              open(u) {
                s.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]))
                if (rest.length) u.write(rest)
              },
              data(u, c) {
                s.write(c)
              },
              close() {
                s.end()
              },
              error() {
                s.end()
              },
            },
          })
          return
        }
        if (d.stage === "relay") {
          const buf = d.buf
          d.buf = Buffer.alloc(0)
          d.up?.then((u) => u.write(buf))
        }
      },
      close(s) {
        s.data.up?.then((u) => u.end())
      },
    },
  })
}

function connectProxy(onConnect: () => void) {
  return Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(s) {
        s.data = { stage: "head", buf: Buffer.alloc(0), up: null as Promise<any> | null }
      },
      data(s, chunk) {
        const d = s.data
        if (d.stage === "head") {
          d.buf = Buffer.concat([d.buf, chunk])
          const text = d.buf.toString("latin1")
          const idx = text.indexOf("\r\n\r\n")
          if (idx < 0) return
          const line = text.slice(0, idx).split("\r\n")[0]
          const rest = d.buf.subarray(idx + 4)
          const m = line.match(/^CONNECT (\S+):(\d+)/)
          if (!m) {
            s.end()
            return
          }
          d.stage = "relay"
          onConnect()
          d.up = Bun.connect({
            hostname: m[1],
            port: Number(m[2]),
            socket: {
              open(u) {
                s.write("HTTP/1.1 200 Connection Established\r\n\r\n")
                if (rest.length) u.write(rest)
              },
              data(u, c) {
                s.write(c)
              },
              close() {
                s.end()
              },
              error() {
                s.end()
              },
            },
          })
          return
        }
        if (d.stage === "relay") {
          d.up?.then((u) => u.write(chunk))
        }
      },
      close(s) {
        s.data.up?.then((u) => u.end())
      },
    },
  })
}

const state = {
  target: null as ReturnType<typeof Bun.serve> | null,
  http: null as ReturnType<typeof Bun.listen> | null,
  socks: null as ReturnType<typeof Bun.listen> | null,
  socksHits: 0,
  httpHits: 0,
  captured: null as Headers | null,
}

beforeAll(() => {
  state.target = Bun.serve({
    port: 0,
    fetch(req) {
      state.captured = req.headers
      return Response.json({ ok: true })
    },
  })
  state.http = connectProxy(() => state.httpHits++)
  state.socks = socksServer(() => state.socksHits++)
})

afterAll(() => {
  state.target?.stop()
  state.http?.stop()
  state.socks?.stop()
})

describe("proxyFetch", () => {
  it("isSocksProxy detects socks schemes", () => {
    expect(isSocksProxy("socks5://h:1080")).toBe(true)
    expect(isSocksProxy("http://h:8080")).toBe(false)
  })

  it("uses a direct fetch when no proxy is set", async () => {
    state.captured = null
    const res = await proxyFetch(`${state.target!.url.origin}/models`, {}, undefined)
    expect(res.status).toBe(200)
    expect(state.captured?.get("x-via-proxy")).toBeNull()
  })

  it("routes through an http proxy", async () => {
    const before = state.httpHits
    const res = await proxyFetch(
      `${state.target!.url.origin}/models`,
      {},
      `http://127.0.0.1:${state.http!.port}`,
    )
    expect(res.status).toBe(200)
    expect(state.httpHits).toBeGreaterThan(before)
  })

  it("routes through a socks5 proxy", async () => {
    const before = state.socksHits
    const res = await proxyFetch(
      `${state.target!.url.origin}/models`,
      {},
      `socks5://127.0.0.1:${state.socks!.port}`,
    )
    expect(res.status).toBe(200)
    expect(state.socksHits).toBeGreaterThan(before)
  })
})
