import { describe, expect, test } from "bun:test"
import { customChatBody, customFimBody, requestCustomChat, requestCustomFim } from "../src/custom-fim"
import type { FimTarget } from "../src/fim"

const target = {
  provider: "custom",
  model: "deepseek-chat",
  url: "http://localhost/completions",
} as Extract<FimTarget, { provider: "custom" }>

const chat = {
  provider: "custom",
  model: "deepseek-chat",
  url: "http://localhost/chat/completions",
  endpoint: "chat",
} as Extract<FimTarget, { provider: "custom" }>

const SSE = 'data: {"choices":[{"text":"ok"}]}\n\ndata: [DONE]\n\n'

describe("customFimBody", () => {
  test("sends native FIM prompt+suffix without client-side templating", () => {
    expect(customFimBody(target, { prefix: "def fib(a):", suffix: "    return a", maxTokens: 128 })).toEqual({
      model: "deepseek-chat",
      prompt: "def fib(a):",
      suffix: "    return a",
      max_tokens: 128,
      temperature: 0.2,
      stream: true,
    })
  })

  test("includes stop sequences only when provided", () => {
    expect(customFimBody(target, { prefix: "p", suffix: "s", stop: ["\n\n"] }).stop).toEqual(["\n\n"])
    expect(customFimBody(target, { prefix: "p", suffix: "s" })).not.toHaveProperty("stop")
  })
})

describe("requestCustomFim", () => {
  test("sends Bearer auth when a key is configured and passes SSE through", async () => {
    const seen: { auth: string | null; body: unknown }[] = []
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        seen.push({ auth: req.headers.get("authorization"), body: await req.json() })
        return new Response(SSE, { headers: { "Content-Type": "text/event-stream" } })
      },
    })
    try {
      const response = await requestCustomFim(
        { ...target, url: `${server.url}completions`, apiKey: "sk-test" },
        { prefix: "def fib(a):", suffix: "    return a" },
        AbortSignal.timeout(5000),
      )
      expect(response.status).toBe(200)
      expect(response.headers.get("Content-Type")).toBe("text/event-stream")
      expect(await response.text()).toBe(SSE)
      expect(seen[0]?.auth).toBe("Bearer sk-test")
      expect(seen[0]?.body).toMatchObject({ model: "deepseek-chat", prompt: "def fib(a):", suffix: "    return a" })
    } finally {
      server.stop(true)
    }
  })

  test("omits Authorization entirely when the key is empty", async () => {
    const seen: (string | null)[] = []
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        seen.push(req.headers.get("authorization"))
        return new Response(SSE, { headers: { "Content-Type": "text/event-stream" } })
      },
    })
    try {
      const response = await requestCustomFim(
        { ...target, url: `${server.url}completions` },
        { prefix: "p", suffix: "s" },
        AbortSignal.timeout(5000),
      )
      expect(response.status).toBe(200)
      expect(seen).toEqual([null])
    } finally {
      server.stop(true)
    }
  })

  test("returns upstream errors untouched", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({ error: { message: "API budget exhausted." } }, { status: 402 })
      },
    })
    try {
      const response = await requestCustomFim(
        { ...target, url: `${server.url}completions` },
        { prefix: "p", suffix: "s" },
        AbortSignal.timeout(5000),
      )
      expect(response.status).toBe(402)
      expect(await response.json()).toEqual({ error: { message: "API budget exhausted." } })
    } finally {
      server.stop(true)
    }
  })

  test("uses the supplied transport", async () => {
    const seen: { url: string; init: RequestInit }[] = []
    const response = await requestCustomFim(
      target,
      { prefix: "p", suffix: "s" },
      AbortSignal.timeout(5000),
      (url, init) => {
        seen.push({ url, init })
        return Promise.resolve(new Response(SSE, { headers: { "Content-Type": "text/event-stream" } }))
      },
    )
    expect(seen.length).toBe(1)
    expect(seen[0]?.url).toBe(target.url)
    expect(seen[0]?.init.method).toBe("POST")
    expect(response.status).toBe(200)
  })
})

const CHAT_SSE = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n'

describe("customChatBody", () => {
  test("wraps rendered user content in a single user message", () => {
    expect(customChatBody(chat, { prefix: "def fib(a):" })).toEqual({
      model: "deepseek-chat",
      messages: [{ role: "user", content: "def fib(a):" }],
      max_tokens: 256,
      temperature: 0.2,
      stream: true,
    })
  })

  test("prepends a system message when provided", () => {
    expect(customChatBody(chat, { prefix: "p", system: "be terse" }).messages).toEqual([
      { role: "system", content: "be terse" },
      { role: "user", content: "p" },
    ])
  })

  test("includes stop sequences only when provided", () => {
    expect(customChatBody(chat, { prefix: "p", stop: ["\n\n"] }).stop).toEqual(["\n\n"])
    expect(customChatBody(chat, { prefix: "p" })).not.toHaveProperty("stop")
  })
})

describe("requestCustomChat", () => {
  test("sends Bearer auth when a key is configured and passes SSE through", async () => {
    const seen: { auth: string | null; body: unknown }[] = []
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        seen.push({ auth: req.headers.get("authorization"), body: await req.json() })
        return new Response(CHAT_SSE, { headers: { "Content-Type": "text/event-stream" } })
      },
    })
    try {
      const response = await requestCustomChat(
        { ...chat, url: `${server.url}chat/completions`, apiKey: "sk-test" },
        { prefix: "def fib(a):", system: "be terse" },
        AbortSignal.timeout(5000),
      )
      expect(response.status).toBe(200)
      expect(response.headers.get("Content-Type")).toBe("text/event-stream")
      expect(await response.text()).toBe(CHAT_SSE)
      expect(seen[0]?.auth).toBe("Bearer sk-test")
      expect(seen[0]?.body).toMatchObject({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "be terse" },
          { role: "user", content: "def fib(a):" },
        ],
      })
    } finally {
      server.stop(true)
    }
  })

  test("omits Authorization entirely when the key is empty", async () => {
    const seen: (string | null)[] = []
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        seen.push(req.headers.get("authorization"))
        return new Response(CHAT_SSE, { headers: { "Content-Type": "text/event-stream" } })
      },
    })
    try {
      const response = await requestCustomChat(
        { ...chat, url: `${server.url}chat/completions` },
        { prefix: "p" },
        AbortSignal.timeout(5000),
      )
      expect(response.status).toBe(200)
      expect(seen).toEqual([null])
    } finally {
      server.stop(true)
    }
  })

  test("returns upstream errors untouched", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({ error: { message: "API budget exhausted." } }, { status: 402 })
      },
    })
    try {
      const response = await requestCustomChat(
        { ...chat, url: `${server.url}chat/completions` },
        { prefix: "p" },
        AbortSignal.timeout(5000),
      )
      expect(response.status).toBe(402)
      expect(await response.json()).toEqual({ error: { message: "API budget exhausted." } })
    } finally {
      server.stop(true)
    }
  })

  test("uses the supplied transport", async () => {
    const seen: { url: string; init: RequestInit }[] = []
    const response = await requestCustomChat(
      chat,
      { prefix: "p" },
      AbortSignal.timeout(5000),
      (url, init) => {
        seen.push({ url, init })
        return Promise.resolve(new Response(CHAT_SSE, { headers: { "Content-Type": "text/event-stream" } }))
      },
    )
    expect(seen.length).toBe(1)
    expect(seen[0]?.url).toBe(chat.url)
    expect(seen[0]?.init.method).toBe("POST")
    expect(response.status).toBe(200)
  })
})
