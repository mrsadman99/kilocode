import * as HttpApiServer from "@/server/routes/instance/httpapi/server"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { ConfigProvider, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { resetDatabase } from "../../fixture/db"
import { disposeAllInstances, tmpdir } from "../../fixture/fixture"

const SSE = 'data: {"choices":[{"text":"ok"}]}\n\ndata: [DONE]\n\n'
const PROXY_ENV = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"] as const

function app() {
  const handler = HttpRouter.toWebHandler(
    HttpApiServer.routes.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            KILO_EXPERIMENTAL_DISABLE_FILEWATCHER: process.env.KILO_EXPERIMENTAL_DISABLE_FILEWATCHER ?? "true",
          }),
        ),
      ),
    ),
    { disableLogger: true },
  ).handler

  return {
    request(input: string, init?: RequestInit) {
      return handler(new Request(new URL(input, "http://localhost"), init), HttpApiServer.context)
    },
  }
}

const state = {
  target: null as ReturnType<typeof Bun.serve> | null,
  proxy: null as ReturnType<typeof Bun.serve> | null,
  seen: [] as { auth: string | null; via: string | null; body: Record<string, unknown> }[],
  saved: {} as Record<string, string | undefined>,
}

function fim(dir: string, extra: Record<string, unknown>) {
  return app().request("/kilo/fim", {
    method: "POST",
    headers: { "content-type": "application/json", "x-kilo-directory": dir },
    body: JSON.stringify({
      prefix: "def fib(a):",
      suffix: "    return a",
      provider: "custom",
      model: "deepseek-chat",
      baseURL: `http://127.0.0.1:${state.target!.port}`,
      ...extra,
    }),
  })
}

beforeAll(() => {
  for (const key of PROXY_ENV) {
    state.saved[key] = process.env[key]
    process.env[key] = ""
  }
  state.target = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      state.seen.push({
        auth: req.headers.get("authorization"),
        via: req.headers.get("x-via-proxy"),
        body: (await req.json()) as Record<string, unknown>,
      })
      return new Response(SSE, { headers: { "content-type": "text/event-stream" } })
    },
  })
  state.proxy = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const headers = new Headers(req.headers)
      headers.set("x-via-proxy", "1")
      const body = await req.arrayBuffer()
      return fetch(req.url, { method: req.method, headers, body })
    },
  })
})

afterAll(() => {
  state.target?.stop(true)
  state.proxy?.stop(true)
  for (const key of PROXY_ENV) {
    const value = state.saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

afterEach(async () => {
  state.seen.length = 0
  await disposeAllInstances()
  await resetDatabase()
})

describe("fim custom provider", () => {
  test("sends native prompt+suffix without auth when the key is empty", async () => {
    await using tmp = await tmpdir({ config: {} })
    const response = await fim(tmp.path, {})
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(SSE)
    expect(state.seen.length).toBe(1)
    expect(state.seen[0]?.auth).toBeNull()
    expect(state.seen[0]?.body).toMatchObject({
      model: "deepseek-chat",
      prompt: "def fib(a):",
      suffix: "    return a",
      stream: true,
    })
  })

  test("sends the payload API key as a Bearer token", async () => {
    await using tmp = await tmpdir({ config: {} })
    const response = await fim(tmp.path, { apiKey: "sk-test" })
    expect(response.status).toBe(200)
    expect(state.seen[0]?.auth).toBe("Bearer sk-test")
  })

  test("routes through the payload proxy", async () => {
    await using tmp = await tmpdir({ config: {} })
    const response = await fim(tmp.path, { proxy: `http://127.0.0.1:${state.proxy!.port}` })
    expect(response.status).toBe(200)
    expect(state.seen[0]?.via).toBe("1")
  })

  test("rejects a missing model or base URL", async () => {
    await using tmp = await tmpdir({ config: {} })
    const nomodel = await app().request("/kilo/fim", {
      method: "POST",
      headers: { "content-type": "application/json", "x-kilo-directory": tmp.path },
      body: JSON.stringify({
        prefix: "p",
        suffix: "s",
        provider: "custom",
        baseURL: `http://127.0.0.1:${state.target!.port}`,
      }),
    })
    expect(nomodel.status).toBe(400)
    const nobase = await app().request("/kilo/fim", {
      method: "POST",
      headers: { "content-type": "application/json", "x-kilo-directory": tmp.path },
      body: JSON.stringify({ prefix: "p", suffix: "s", provider: "custom", model: "m" }),
    })
    expect(nobase.status).toBe(400)
    expect(state.seen.length).toBe(0)
  })

  test("templated completions format posts the wrapped prompt to /v1/completions", async () => {
    await using tmp = await tmpdir({ config: {} })
    const response = await fim(tmp.path, { endpoint: "completions", prefix: "<fim_prefix>p<fim_suffix>s<fim_middle>" })
    expect(response.status).toBe(200)
    expect(state.seen.length).toBe(1)
    expect(state.seen[0]?.body).toMatchObject({ prompt: "<fim_prefix>p<fim_suffix>s<fim_middle>" })
    expect(state.seen[0]?.body).not.toHaveProperty("suffix")
  })

  test("templated generate format normalizes Ollama NDJSON to SSE", async () => {
    const ollama = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response('{"response":"ok","done":false}\n{"response":"","done":true,"eval_count":2}\n', {
          headers: { "Content-Type": "application/x-ndjson" },
        })
      },
    })
    try {
      await using tmp = await tmpdir({ config: {} })
      const response = await app().request("/kilo/fim", {
        method: "POST",
        headers: { "content-type": "application/json", "x-kilo-directory": tmp.path },
        body: JSON.stringify({
          prefix: "<|fim_prefix|>p<|fim_suffix|>s<|fim_middle|>",
          suffix: "",
          provider: "custom",
          model: "qwen2.5-coder:7b",
          baseURL: `http://127.0.0.1:${ollama.port}`,
          endpoint: "generate",
        }),
      })
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("text/event-stream")
      expect(await response.text()).toBe(
        'data: {"choices":[{"text":"ok"}]}\n\ndata: {"choices":[{"text":""}],"usage":{"prompt_tokens":0,"completion_tokens":2}}\n\n',
      )
    } finally {
      ollama.stop(true)
    }
  })
})

describe("fim custom chat provider", () => {
  const CHAT_SSE = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n'

  function chat(dir: string, baseURL: string, extra: Record<string, unknown> = {}) {
    return app().request("/kilo/fim", {
      method: "POST",
      headers: { "content-type": "application/json", "x-kilo-directory": dir },
      body: JSON.stringify({
        prefix: "def fib(a):",
        suffix: "",
        provider: "custom",
        model: "deepseek-chat",
        baseURL,
        endpoint: "chat",
        ...extra,
      }),
    })
  }

  test("posts a single user message and passes delta.content through", async () => {
    const seen: { auth: string | null; body: Record<string, unknown> }[] = []
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        seen.push({ auth: req.headers.get("authorization"), body: (await req.json()) as Record<string, unknown> })
        return new Response(CHAT_SSE, { headers: { "content-type": "text/event-stream" } })
      },
    })
    try {
      await using tmp = await tmpdir({ config: {} })
      const response = await chat(tmp.path, `http://127.0.0.1:${server.port}`)
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("text/event-stream")
      expect(await response.text()).toBe(CHAT_SSE)
      expect(seen.length).toBe(1)
      expect(seen[0]?.auth).toBeNull()
      expect(seen[0]?.body).toEqual({
        model: "deepseek-chat",
        messages: [{ role: "user", content: "def fib(a):" }],
        max_tokens: 256,
        temperature: 0.2,
        stream: true,
      })
    } finally {
      server.stop(true)
    }
  })

  test("prepends a system message, adds stop, and sends the key as Bearer", async () => {
    const seen: { auth: string | null; body: Record<string, unknown> }[] = []
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        seen.push({ auth: req.headers.get("authorization"), body: (await req.json()) as Record<string, unknown> })
        return new Response(CHAT_SSE, { headers: { "content-type": "text/event-stream" } })
      },
    })
    try {
      await using tmp = await tmpdir({ config: {} })
      const response = await chat(tmp.path, `http://127.0.0.1:${server.port}`, {
        system: "be terse",
        stop: ["\n\n"],
        apiKey: "sk-test",
      })
      expect(response.status).toBe(200)
      expect(seen[0]?.auth).toBe("Bearer sk-test")
      expect(seen[0]?.body).toEqual({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "be terse" },
          { role: "user", content: "def fib(a):" },
        ],
        max_tokens: 256,
        temperature: 0.2,
        stream: true,
        stop: ["\n\n"],
      })
    } finally {
      server.stop(true)
    }
  })

  test("rejects chat without an explicit base URL or model", async () => {
    await using tmp = await tmpdir({ config: {} })
    const nobase = await app().request("/kilo/fim", {
      method: "POST",
      headers: { "content-type": "application/json", "x-kilo-directory": tmp.path },
      body: JSON.stringify({ prefix: "p", suffix: "", provider: "custom", model: "m", endpoint: "chat" }),
    })
    expect(nobase.status).toBe(400)
    const nomodel = await app().request("/kilo/fim", {
      method: "POST",
      headers: { "content-type": "application/json", "x-kilo-directory": tmp.path },
      body: JSON.stringify({
        prefix: "p",
        suffix: "",
        provider: "custom",
        baseURL: "http://127.0.0.1:1",
        endpoint: "chat",
      }),
    })
    expect(nomodel.status).toBe(400)
  })

  test("rejects chat for a non-custom provider", async () => {
    await using tmp = await tmpdir({ config: {} })
    const response = await app().request("/kilo/fim", {
      method: "POST",
      headers: { "content-type": "application/json", "x-kilo-directory": tmp.path },
      body: JSON.stringify({
        prefix: "p",
        suffix: "",
        provider: "local",
        model: "m",
        baseURL: "http://127.0.0.1:1",
        endpoint: "chat",
      }),
    })
    expect(response.status).toBe(400)
  })
})
