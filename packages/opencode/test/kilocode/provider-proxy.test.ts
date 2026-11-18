import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { streamText } from "ai"
import { Provider } from "@/provider/provider"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { testEffect } from "../lib/effect"
import { isSocks, socksFetch } from "@/kilocode/provider/proxy"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Provider.node])))

function chatStream(text: string) {
  const chunk = (delta: Record<string, unknown>, finish: string | null) =>
    `data: ${JSON.stringify({
      id: "chatcmpl-1",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`
  return chunk({ role: "assistant", content: text }, null) + chunk({}, "stop") + "data: [DONE]\n\n"
}

// Minimal SOCKS5 server (no-auth and user/pass), relaying to the requested host.
type Relay = { stage: string; buf: Buffer; up: Promise<any> | null; user?: string; pass?: string }

function socksServer(onConnect: () => void, requireAuth = false) {
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
          const methods = [...d.buf.subarray(2, 2 + n)]
          d.buf = d.buf.subarray(2 + n)
          if (requireAuth && methods.includes(2)) {
            s.write(Buffer.from([5, 2]))
            d.stage = "auth"
          } else if (methods.includes(0)) {
            s.write(Buffer.from([5, 0]))
            d.stage = "req"
          } else {
            s.write(Buffer.from([5, 255]))
            s.end()
          }
          return
        }
        if (d.stage === "auth") {
          if (d.buf.length < 3) return
          const ulen = d.buf[1]
          if (d.buf.length < 3 + ulen) return
          const plen = d.buf[2 + ulen]
          if (d.buf.length < 3 + ulen + plen) return
          d.user = d.buf.subarray(2, 2 + ulen).toString()
          d.pass = d.buf.subarray(3 + ulen, 3 + ulen + plen).toString()
          d.buf = d.buf.subarray(3 + ulen + plen)
          s.write(Buffer.from([1, 0]))
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
  socksAuth: null as ReturnType<typeof socksServer> | null,
  socksHits: 0,
  captured: null as Headers | null,
}

beforeAll(() => {
  state.target = Bun.serve({
    port: 0,
    async fetch(req) {
      state.captured = req.headers
      await req.arrayBuffer()
      return new Response(chatStream("Hello"), { headers: { "content-type": "text/event-stream" } })
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
  state.socksAuth = socksServer(() => state.socksHits++, true)
})

afterAll(() => {
  state.target?.stop()
  state.http?.stop()
  state.socks?.stop()
  state.socksAuth?.stop()
})

function config(proxy: string, id: string) {
  return {
    enabled_providers: [id],
    provider: {
      [id]: {
        name: "Proxy Test",
        npm: "@ai-sdk/openai-compatible",
        models: { m: { name: "M", tool_call: true, limit: { context: 100000, output: 4096 } } },
        options: { apiKey: "test-key", baseURL: `${state.target!.url.origin}/v1`, proxy },
      },
    },
  }
}

async function drive(language: any) {
  const result = streamText({ model: language, prompt: "hi" })
  await result.text
}

describe("provider proxy", () => {
  test("isSocks detects socks schemes", () => {
    expect(isSocks("socks5://127.0.0.1:1080")).toBe(true)
    expect(isSocks("socks5h://h:1080")).toBe(true)
    expect(isSocks("socks4://h:1080")).toBe(true)
    expect(isSocks("http://h:8080")).toBe(false)
    expect(isSocks("https://h:8080")).toBe(false)
  })

  test("socksFetch tunnels a request without auth", async () => {
    const res = await socksFetch(`socks5://127.0.0.1:${state.socks!.port}`, `${state.target!.url.origin}/v1/models`)
    expect(res.status).toBe(200)
    await res.arrayBuffer()
  })

  test("socksFetch tunnels with username/password auth", async () => {
    const res = await socksFetch(
      `socks5://user:pass@127.0.0.1:${state.socksAuth!.port}`,
      `${state.target!.url.origin}/v1/models`,
    )
    expect(res.status).toBe(200)
    await res.arrayBuffer()
  })

  test("socksFetch streams SSE bodies", async () => {
    const res = await socksFetch(
      `socks5://127.0.0.1:${state.socks!.port}`,
      `${state.target!.url.origin}/v1/chat/completions`,
      { method: "POST", body: JSON.stringify({ model: "m", messages: [] }) },
    )
    const text = await res.text()
    expect(text).toContain("data: [DONE]")
    expect(text).toContain("Hello")
  })

  it.instance(
    "routes provider requests through an http proxy",
    () =>
      Effect.gen(function* () {
        const model = yield* Provider.use.getModel(ProviderV2.ID.make("proxy-http"), ModelV2.ID.make("m"))
        const language = yield* Provider.use.getLanguage(model)
        yield* Effect.promise(() => drive(language))
        expect(state.captured?.get("x-via-proxy")).toBe("1")
      }),
    { config: () => config(`http://127.0.0.1:${state.http!.port}`, "proxy-http") },
  )

  it.instance(
    "routes provider requests through a socks5 proxy",
    () =>
      Effect.gen(function* () {
        const before = state.socksHits
        const model = yield* Provider.use.getModel(ProviderV2.ID.make("proxy-socks"), ModelV2.ID.make("m"))
        const language = yield* Provider.use.getLanguage(model)
        yield* Effect.promise(() => drive(language))
        expect(state.socksHits).toBeGreaterThan(before)
      }),
    { config: () => config(`socks5://127.0.0.1:${state.socks!.port}`, "proxy-socks") },
  )

  it.instance(
    "applies a config proxy to a standard (models.dev) provider",
    () =>
      Effect.gen(function* () {
        const providers = yield* Provider.use.list()
        expect(providers[ProviderV2.ID.anthropic]?.options.proxy).toBe("socks5://127.0.0.1:1080")
      }),
    {
      config: () => ({
        provider: { anthropic: { options: { apiKey: "test-key", proxy: "socks5://127.0.0.1:1080" } } },
      }),
    },
  )
})
