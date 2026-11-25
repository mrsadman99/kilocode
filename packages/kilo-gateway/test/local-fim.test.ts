import { describe, expect, test } from "bun:test"
import { localFimBody, ollamaSse, requestLocalFim } from "../src/local-fim"

const generate = {
  provider: "local",
  model: "qwen2.5-coder:7b",
  url: "http://localhost/api/generate",
  endpoint: "generate",
} as const
const completions = {
  provider: "local",
  model: "starcoder2:7b",
  url: "http://localhost/v1/completions",
  endpoint: "completions",
} as const

function stream(chunks: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function collect(input: AsyncGenerator<string>) {
  const out: string[] = []
  for await (const chunk of input) out.push(chunk)
  return out
}

describe("localFimBody", () => {
  test("builds an Ollama raw generate request", () => {
    expect(
      localFimBody(generate, {
        prefix: "<|fim_prefix|>a<|fim_suffix|>b<|fim_middle|>",
        maxTokens: 128,
        temperature: 0.1,
        stop: ["<|endoftext|>"],
      }),
    ).toEqual({
      model: "qwen2.5-coder:7b",
      prompt: "<|fim_prefix|>a<|fim_suffix|>b<|fim_middle|>",
      raw: true,
      stream: true,
      options: { temperature: 0.1, num_predict: 128, stop: ["<|endoftext|>"] },
    })
  })

  test("builds an OpenAI-compatible completions request", () => {
    expect(
      localFimBody(completions, { prefix: "<fim_prefix>a<fim_suffix>b<fim_middle>", stop: ["<fim_middle>"] }),
    ).toEqual({
      model: "starcoder2:7b",
      prompt: "<fim_prefix>a<fim_suffix>b<fim_middle>",
      max_tokens: 256,
      temperature: 0.2,
      stream: true,
      stop: ["<fim_middle>"],
    })
  })
})

describe("ollamaSse", () => {
  test("normalizes NDJSON chunks into SSE events and reports usage on done", async () => {
    const body = stream([
      '{"response":"Hello","done":false}\n{"response":" world","done":false}\n',
      '{"response":"","done":true,"prompt_eval_count":12,"eval_count":3}\n',
    ])
    expect(await collect(ollamaSse(body))).toEqual([
      'data: {"choices":[{"text":"Hello"}]}\n\n',
      'data: {"choices":[{"text":" world"}]}\n\n',
      'data: {"choices":[{"text":""}],"usage":{"prompt_tokens":12,"completion_tokens":3}}\n\n',
    ])
  })

  test("handles JSON lines split across reads", async () => {
    const body = stream(['{"response":"par', 'tial","done":false}\n'])
    expect(await collect(ollamaSse(body))).toEqual(['data: {"choices":[{"text":"partial"}]}\n\n'])
  })

  test("emits the final line even without a trailing newline", async () => {
    const body = stream(['{"response":"ok","done":false}\n{"response":"","done":true,"eval_count":2}'])
    expect(await collect(ollamaSse(body))).toEqual([
      'data: {"choices":[{"text":"ok"}]}\n\n',
      'data: {"choices":[{"text":""}],"usage":{"prompt_tokens":0,"completion_tokens":2}}\n\n',
    ])
  })

  test("throws on an Ollama error record instead of yielding an empty completion", async () => {
    const body = stream(['{"error":"model \'nope\' not found"}\n'])
    expect(collect(ollamaSse(body))).rejects.toThrow("FIM local error: model 'nope' not found")
  })
})

describe("requestLocalFim", () => {
  test("proxies generate and normalizes the stream to SSE", async () => {
    const bodies: Record<string, unknown>[] = []
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        bodies.push((await req.json()) as Record<string, unknown>)
        return new Response('{"response":"ok","done":false}\n{"response":"","done":true,"eval_count":1}\n', {
          headers: { "Content-Type": "application/x-ndjson" },
        })
      },
    })
    try {
      const target = { ...generate, url: `${server.url}api/generate` }
      const response = await requestLocalFim(
        target,
        { prefix: "prompt", stop: ["<|endoftext|>"] },
        AbortSignal.timeout(5000),
      )
      expect(response.status).toBe(200)
      expect(response.headers.get("Content-Type")).toBe("text/event-stream")
      expect(await response.text()).toBe(
        'data: {"choices":[{"text":"ok"}]}\n\ndata: {"choices":[{"text":""}],"usage":{"prompt_tokens":0,"completion_tokens":1}}\n\n',
      )
      expect(bodies[0]).toEqual({
        model: "qwen2.5-coder:7b",
        prompt: "prompt",
        raw: true,
        stream: true,
        options: { temperature: 0.2, num_predict: 256, stop: ["<|endoftext|>"] },
      })
    } finally {
      server.stop(true)
    }
  })

  test("passes completions SSE through unchanged", async () => {
    const sse = 'data: {"choices":[{"text":"hi"}]}\n\ndata: [DONE]\n\n'
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(sse, { headers: { "Content-Type": "text/event-stream" } })
      },
    })
    try {
      const target = { ...completions, url: `${server.url}v1/completions` }
      const response = await requestLocalFim(target, { prefix: "prompt" }, AbortSignal.timeout(5000))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(sse)
    } finally {
      server.stop(true)
    }
  })

  test("returns upstream errors untouched", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({ error: "model not found" }, { status: 404 })
      },
    })
    try {
      const target = { ...generate, url: `${server.url}api/generate` }
      const response = await requestLocalFim(target, { prefix: "prompt" }, AbortSignal.timeout(5000))
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: "model not found" })
    } finally {
      server.stop(true)
    }
  })

  test("uses the supplied transport and normalizes its stream", async () => {
    const seen: { url: string; init: RequestInit }[] = []
    const target = { ...generate, url: "http://localhost/api/generate" }
    const response = await requestLocalFim(target, { prefix: "prompt" }, AbortSignal.timeout(5000), (url, init) => {
      seen.push({ url, init })
      return Promise.resolve(
        new Response('{"response":"ok","done":false}\n{"response":"","done":true,"eval_count":1}\n', {
          headers: { "Content-Type": "application/x-ndjson" },
        }),
      )
    })
    expect(seen.length).toBe(1)
    expect(seen[0]?.url).toBe(target.url)
    expect(seen[0]?.init.method).toBe("POST")
    expect(response.headers.get("Content-Type")).toBe("text/event-stream")
    expect(await response.text()).toBe(
      'data: {"choices":[{"text":"ok"}]}\n\ndata: {"choices":[{"text":""}],"usage":{"prompt_tokens":0,"completion_tokens":1}}\n\n',
    )
  })

  test("sends Bearer auth when a key is configured", async () => {
    const seen: (string | null)[] = []
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        seen.push(req.headers.get("authorization"))
        return new Response('{"response":"ok","done":true,"eval_count":1}\n', {
          headers: { "Content-Type": "application/x-ndjson" },
        })
      },
    })
    try {
      const target = { ...generate, url: `${server.url}api/generate`, apiKey: "sk-test" }
      await requestLocalFim(target, { prefix: "prompt" }, AbortSignal.timeout(5000))
      expect(seen).toEqual(["Bearer sk-test"])
    } finally {
      server.stop(true)
    }
  })

  test("omits Authorization entirely when no key is configured", async () => {
    const seen: (string | null)[] = []
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        seen.push(req.headers.get("authorization"))
        return new Response('{"response":"ok","done":true,"eval_count":1}\n', {
          headers: { "Content-Type": "application/x-ndjson" },
        })
      },
    })
    try {
      const target = { ...generate, url: `${server.url}api/generate` }
      await requestLocalFim(target, { prefix: "prompt" }, AbortSignal.timeout(5000))
      expect(seen).toEqual([null])
    } finally {
      server.stop(true)
    }
  })
})
