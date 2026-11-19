import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { CodexAuthPlugin } from "@/plugin/openai/codex"
import { proxiedFetch } from "@/kilocode/provider/proxy"

type Relay = { stage: string; buf: Buffer; up: Promise<any> | null }

function socksServer(onConnect: () => void) {
  return Bun.listen<Relay>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(s) {
        s.data = { stage: "greet", buf: Buffer.alloc(0), up: null }
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

const state = {
  target: null as ReturnType<typeof Bun.serve> | null,
  http: null as ReturnType<typeof Bun.serve> | null,
  socks: null as ReturnType<typeof socksServer> | null,
  socksHits: 0,
  captured: null as { headers: Headers; path: string } | null,
}

beforeAll(() => {
  state.target = Bun.serve({
    port: 0,
    async fetch(req) {
      state.captured = { headers: req.headers, path: new URL(req.url).pathname }
      await req.arrayBuffer()
      return Response.json({ ok: true })
    },
  })
  state.http = Bun.serve({
    port: 0,
    async fetch(req) {
      const headers = new Headers(req.headers)
      headers.set("x-via-proxy", "1")
      const body = await req.arrayBuffer()
      return fetch(req.url, { method: req.method, headers, body })
    },
  })
  state.socks = socksServer(() => state.socksHits++)
})

afterAll(() => {
  state.target?.stop()
  state.http?.stop()
  state.socks?.stop()
})

const captured = () => state.captured as { headers: Headers; path: string } | null

const auth = () =>
  Promise.resolve({
    type: "oauth" as const,
    access: "test-access-token",
    refresh: "test-refresh",
    expires: Date.now() + 3_600_000,
    accountId: "acc-123",
  })

async function codexFetch(proxy: string | undefined) {
  const hooks = await CodexAuthPlugin({} as never, {
    codexApiEndpoint: `${state.target!.url.origin}/backend-api/codex/responses`,
    experimentalWebSockets: false,
  })
  const loaded = await hooks.auth!.loader!(auth, {} as never)
  const init: RequestInit = { method: "POST", body: JSON.stringify({ model: "gpt-5.1-codex", input: [] }) }
  if (proxy) (init as { proxy?: string }).proxy = proxy
  return loaded.fetch(new URL("https://api.openai.com/v1/responses"), init) as Promise<Response>
}

describe("proxiedFetch", () => {
  test("returns the global fetch when no proxy is set", () => {
    expect(proxiedFetch(undefined)).toBe(fetch)
  })

  test("routes through an http proxy", async () => {
    state.captured = null
    const res = await proxiedFetch(`http://127.0.0.1:${state.http!.port}`)(state.target!.url.origin, {})
    expect(res.status).toBe(200)
    expect(captured()?.headers.get("x-via-proxy")).toBe("1")
  })

  test("routes through a socks5 proxy", async () => {
    const before = state.socksHits
    const res = await proxiedFetch(`socks5://127.0.0.1:${state.socks!.port}`)(state.target!.url.origin, {})
    expect(res.status).toBe(200)
    expect(state.socksHits).toBeGreaterThan(before)
  })
})

describe("Codex OAuth requests through a proxy", () => {
  test("http proxy: rewrites to the codex endpoint, keeps the OAuth token", async () => {
    state.captured = null
    const res = await codexFetch(`http://127.0.0.1:${state.http!.port}`)
    expect(res.status).toBe(200)
    expect(captured()?.path).toBe("/backend-api/codex/responses")
    expect(captured()?.headers.get("authorization")).toBe("Bearer test-access-token")
    expect(captured()?.headers.get("chatgpt-account-id")).toBe("acc-123")
    expect(captured()?.headers.get("x-via-proxy")).toBe("1")
  })

  test("socks5 proxy: rewrites to the codex endpoint, keeps the OAuth token", async () => {
    state.captured = null
    const before = state.socksHits
    const res = await codexFetch(`socks5://127.0.0.1:${state.socks!.port}`)
    expect(res.status).toBe(200)
    expect(state.socksHits).toBeGreaterThan(before)
    expect(captured()?.path).toBe("/backend-api/codex/responses")
    expect(captured()?.headers.get("authorization")).toBe("Bearer test-access-token")
    expect(captured()?.headers.get("chatgpt-account-id")).toBe("acc-123")
  })

  test("no proxy: still rewrites to the codex endpoint with the OAuth token", async () => {
    state.captured = null
    const res = await codexFetch(undefined)
    expect(res.status).toBe(200)
    expect(captured()?.path).toBe("/backend-api/codex/responses")
    expect(captured()?.headers.get("authorization")).toBe("Bearer test-access-token")
  })
})
