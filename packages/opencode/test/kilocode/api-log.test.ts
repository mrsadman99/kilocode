import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import * as ApiLog from "../../src/kilocode/api-log"
import { GlobalBus, type GlobalEvent } from "../../src/bus/global"

const saved = { ...process.env }

function collect() {
  const events: Array<GlobalEvent["payload"]> = []
  const handler = (event: GlobalEvent) => {
    if (event.payload?.type === ApiLog.Event.type) events.push(event.payload)
  }
  GlobalBus.on("event", handler)
  return { events, stop: () => GlobalBus.off("event", handler) }
}

beforeEach(() => {
  process.env.KILO_API_LOG = "1"
  delete process.env.HTTP_PROXY
  delete process.env.http_proxy
  delete process.env.HTTPS_PROXY
  delete process.env.https_proxy
  delete process.env.ALL_PROXY
  delete process.env.all_proxy
  delete process.env.NO_PROXY
  delete process.env.no_proxy
})

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in saved)) delete process.env[key]
  }
  Object.assign(process.env, saved)
})

describe("ApiLog.bodyFields", () => {
  test("OpenAI chat reasoning_effort", () => {
    expect(ApiLog.bodyFields(JSON.stringify({ model: "gpt-5", reasoning_effort: "high" }))).toEqual({
      thinking: "high",
      model: "gpt-5",
    })
  })

  test("OpenAI responses reasoning.effort", () => {
    expect(ApiLog.bodyFields(JSON.stringify({ reasoning: { effort: "xhigh" } }))).toEqual({ thinking: "xhigh" })
  })

  test("Anthropic thinking enabled with budget", () => {
    expect(ApiLog.bodyFields(JSON.stringify({ thinking: { type: "enabled", budget_tokens: 8000 } }))).toEqual({
      thinking: "enabled(8000)",
    })
  })

  test("Anthropic thinking disabled and adaptive", () => {
    expect(ApiLog.bodyFields(JSON.stringify({ thinking: { type: "disabled" } }))).toEqual({ thinking: "disabled" })
    expect(ApiLog.bodyFields(JSON.stringify({ thinking: { type: "adaptive" } }))).toEqual({ thinking: "adaptive" })
  })

  test("Gemini thinkingBudget", () => {
    expect(
      ApiLog.bodyFields(JSON.stringify({ generationConfig: { thinkingConfig: { thinkingBudget: 4096 } } })),
    ).toEqual({ thinking: "budget(4096)" })
  })

  test("no reasoning fields returns model only", () => {
    expect(ApiLog.bodyFields(JSON.stringify({ model: "claude-sonnet-4-5" }))).toEqual({ model: "claude-sonnet-4-5" })
  })

  test("invalid JSON, non-string and non-object bodies are ignored", () => {
    expect(ApiLog.bodyFields("{not json")).toEqual({})
    expect(ApiLog.bodyFields(undefined)).toEqual({})
    expect(ApiLog.bodyFields(42)).toEqual({})
    expect(ApiLog.bodyFields(JSON.stringify([1, 2]))).toEqual({})
  })

  test("reasoning markers inside message content do not produce a false mode", () => {
    const body = JSON.stringify({
      model: "gpt-5",
      messages: [{ role: "user", content: 'set "reasoning_effort":"high" and "thinking":{"type":"enabled"}' }],
    })
    expect(ApiLog.bodyFields(body)).toEqual({ model: "gpt-5" })
  })

  test("marker present but body unparseable falls back to the wire model", () => {
    expect(ApiLog.bodyFields('{"model":"gpt-5","reasoning_effort":')).toEqual({ model: "gpt-5" })
  })
})

describe("ApiLog.proxyLabel", () => {
  test("explicit proxy strips credentials", () => {
    expect(ApiLog.proxyLabel("http://user:pass@127.0.0.1:8080", "https://api.anthropic.com/v1/messages")).toBe(
      "http://127.0.0.1:8080",
    )
  })

  test("socks proxy keeps scheme and port", () => {
    expect(ApiLog.proxyLabel("socks5://localhost:1080", "https://api.openai.com/v1/responses")).toBe(
      "socks5://localhost:1080",
    )
  })

  test("https env proxy applies to https targets", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp:3128"
    process.env.HTTP_PROXY = "http://other.corp:3128"
    expect(ApiLog.proxyLabel(undefined, "https://api.anthropic.com/v1/messages")).toBe("env:http://proxy.corp:3128")
    expect(ApiLog.proxyLabel(undefined, "http://localhost:11434/api/generate")).toBe("env:http://other.corp:3128")
  })

  test("ALL_PROXY fallback and lowercase variants", () => {
    process.env.all_proxy = "socks5://localhost:1080"
    expect(ApiLog.proxyLabel(undefined, "https://api.openai.com/v1/chat/completions")).toBe(
      "env:socks5://localhost:1080",
    )
  })

  test("NO_PROXY excludes matching hosts", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp:3128"
    process.env.NO_PROXY = "localhost,.anthropic.com"
    expect(ApiLog.proxyLabel(undefined, "https://api.anthropic.com/v1/messages")).toBeUndefined()
    expect(ApiLog.proxyLabel(undefined, "https://localhost:11434/api/generate")).toBeUndefined()
    expect(ApiLog.proxyLabel(undefined, "https://api.openai.com/v1/responses")).toBe("env:http://proxy.corp:3128")
  })

  test("NO_PROXY wildcard disables env proxy", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp:3128"
    process.env.NO_PROXY = "*"
    expect(ApiLog.proxyLabel(undefined, "https://api.openai.com/v1/responses")).toBeUndefined()
  })

  test("direct transport bypasses env proxy", () => {
    process.env.HTTP_PROXY = "http://proxy.corp:3128"
    expect(ApiLog.proxyLabel(undefined, "http://127.0.0.1:11434/api/generate", true)).toBeUndefined()
  })

  test("no proxy configured", () => {
    expect(ApiLog.proxyLabel(undefined, "https://api.anthropic.com/v1/messages")).toBeUndefined()
  })
})

describe("ApiLog.detailOf", () => {
  test("OpenAI/Anthropic error.message shape", () => {
    expect(ApiLog.detailOf(JSON.stringify({ error: { message: "Rate limit exceeded", type: "rate_limit" } }))).toBe(
      "Rate limit exceeded",
    )
  })

  test("bare error string and message field", () => {
    expect(ApiLog.detailOf(JSON.stringify({ error: "invalid api key" }))).toBe("invalid api key")
    expect(ApiLog.detailOf(JSON.stringify({ message: "model not found" }))).toBe("model not found")
  })

  test("raw text fallback, flattened and truncated", () => {
    expect(ApiLog.detailOf("<html>\n  bad gateway\n</html>")).toBe("<html> bad gateway </html>")
    expect(ApiLog.detailOf("x".repeat(500))).toBe(`${"x".repeat(400)}…`)
  })

  test("empty body yields no detail", () => {
    expect(ApiLog.detailOf("")).toBeUndefined()
    expect(ApiLog.detailOf("   ")).toBeUndefined()
  })
})

describe("ApiLog.llm", () => {
  test("publishes request with model, thinking, proxy, status and path", async () => {
    process.env.HTTPS_PROXY = "http://proxy.corp:3128"
    const sink = collect()
    await ApiLog.llm({
      model: { providerID: "kilo", id: "claude-sonnet-4-5" },
      request: "https://api.anthropic.com/v1/messages?beta=true",
      init: {
        method: "POST",
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          thinking: { type: "enabled", budget_tokens: 8000 },
        }),
      },
      started: Date.now() - 5,
      response: new Response("{}", { status: 200 }),
    })
    sink.stop()
    expect(sink.events.length).toBe(1)
    const props = sink.events[0]!.properties
    expect(props.kind).toBe("llm")
    expect(props.provider).toBe("kilo")
    expect(props.model).toBe("claude-sonnet-4-5")
    expect(props.apiModel).toBe("claude-sonnet-4-5-20250929")
    expect(props.method).toBe("POST")
    expect(props.url).toBe("https://api.anthropic.com/v1/messages")
    expect(props.status).toBe(200)
    expect(props.thinking).toBe("enabled(8000)")
    expect(props.proxy).toBe("env:http://proxy.corp:3128")
    expect(props.ms).toBeGreaterThanOrEqual(0)
    expect(sink.events[0]!.id).toBeTruthy()
  })

  test("explicit proxy wins over env and Request input is unwrapped", async () => {
    process.env.HTTPS_PROXY = "http://proxy.corp:3128"
    const sink = collect()
    await ApiLog.llm({
      model: { providerID: "openai", id: "gpt-5" },
      request: new Request("https://api.openai.com/v1/responses", { method: "POST" }),
      proxy: "http://user:pass@127.0.0.1:8080",
      started: Date.now(),
      response: new Response("{}", { status: 429 }),
    })
    sink.stop()
    const props = sink.events[0]!.properties
    expect(props.method).toBe("POST")
    expect(props.url).toBe("https://api.openai.com/v1/responses")
    expect(props.proxy).toBe("http://127.0.0.1:8080")
    expect(props.status).toBe(429)
    expect(props.apiModel).toBeUndefined()
  })

  test("non-2xx records the provider error message without consuming the body", async () => {
    const sink = collect()
    const res = new Response(JSON.stringify({ error: { message: "Insufficient quota" } }), { status: 402 })
    await ApiLog.llm({
      model: { providerID: "kilo", id: "kilo-auto/free" },
      request: "https://api.kilo.ai/v1/chat/completions",
      init: { method: "POST" },
      started: Date.now(),
      response: res,
    })
    sink.stop()
    const props = sink.events[0]!.properties
    expect(props.status).toBe(402)
    expect(props.detail).toBe("Insufficient quota")
    expect(await res.text()).toBe(JSON.stringify({ error: { message: "Insufficient quota" } }))
  })

  test("broken error body still logs the status without rejecting", async () => {
    const sink = collect()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("connection reset"))
      },
    })
    await ApiLog.llm({
      model: { providerID: "kilo", id: "kilo-auto/free" },
      request: "https://api.kilo.ai/v1/chat/completions",
      init: { method: "POST" },
      started: Date.now(),
      response: new Response(stream, { status: 502 }),
    })
    sink.stop()
    const props = sink.events[0]!.properties
    expect(props.status).toBe(502)
    expect(props.detail).toBeUndefined()
  })

  test("records network errors", async () => {
    const sink = collect()
    await ApiLog.llm({
      model: { providerID: "kilo", id: "kilo-auto/free" },
      request: "https://api.kilo.ai/v1/chat/completions",
      init: { method: "POST" },
      started: Date.now(),
      error: new Error("connection refused"),
    })
    sink.stop()
    const props = sink.events[0]!.properties
    expect(props.error).toBe("connection refused")
    expect(props.status).toBeUndefined()
    expect(props.proxy).toBeUndefined()
  })

  test("disabled without KILO_API_LOG", async () => {
    delete process.env.KILO_API_LOG
    const sink = collect()
    await ApiLog.llm({
      model: { providerID: "kilo", id: "kilo-auto/free" },
      request: "https://api.kilo.ai/v1/chat/completions",
      started: Date.now(),
      response: new Response("{}", { status: 200 }),
    })
    sink.stop()
    expect(sink.events.length).toBe(0)
  })
})

describe("ApiLog.trace", () => {
  test("records autocomplete status and returns the response", async () => {
    const sink = collect()
    const res = await ApiLog.trace(
      { provider: "mistral", model: "codestral-2508", url: "https://codestral.mistral.ai/v1/fim/completions" },
      async () => new Response("ok", { status: 200 }),
    )
    sink.stop()
    expect(res.status).toBe(200)
    const props = sink.events[0]!.properties
    expect(props.kind).toBe("autocomplete")
    expect(props.provider).toBe("mistral")
    expect(props.model).toBe("codestral-2508")
    expect(props.method).toBe("POST")
    expect(props.url).toBe("https://codestral.mistral.ai/v1/fim/completions")
    expect(props.status).toBe(200)
  })

  test("records the provider error message on non-2xx", async () => {
    const sink = collect()
    const res = await ApiLog.trace(
      { provider: "kilo", model: "codestral-2508", url: "https://api.kilo.ai/fim/completions" },
      async () => new Response(JSON.stringify({ error: "FIM quota exhausted" }), { status: 402 }),
    )
    sink.stop()
    expect(res.status).toBe(402)
    const props = sink.events[0]!.properties
    expect(props.status).toBe(402)
    expect(props.detail).toBe("FIM quota exhausted")
    expect(await res.text()).toBe(JSON.stringify({ error: "FIM quota exhausted" }))
  })

  test("strips credentials and query from the logged URL", async () => {
    const sink = collect()
    await ApiLog.trace(
      {
        provider: "local",
        model: "qwen2.5-coder:7b",
        url: "http://user:pass@127.0.0.1:11434/api/generate?token=secret",
        direct: true,
      },
      async () => new Response("ok", { status: 200 }),
    )
    sink.stop()
    expect(sink.events[0]!.properties.url).toBe("http://127.0.0.1:11434/api/generate")
  })

  test("broken error body still returns the response and logs the status", async () => {
    const sink = collect()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("connection reset"))
      },
    })
    const res = await ApiLog.trace(
      { provider: "kilo", model: "codestral-2508", url: "https://api.kilo.ai/fim/completions" },
      async () => new Response(stream, { status: 502 }),
    )
    sink.stop()
    expect(res.status).toBe(502)
    const props = sink.events[0]!.properties
    expect(props.status).toBe(502)
    expect(props.detail).toBeUndefined()
    expect(props.error).toBeUndefined()
  })

  test("records failures and rethrows", async () => {
    const sink = collect()
    const failure = ApiLog.trace(
      { provider: "local", model: "qwen2.5-coder:7b", url: "http://127.0.0.1:11434/api/generate", direct: true },
      async () => {
        throw new Error("connect ECONNREFUSED")
      },
    )
    await expect(failure).rejects.toThrow("connect ECONNREFUSED")
    sink.stop()
    const props = sink.events[0]!.properties
    expect(props.kind).toBe("autocomplete")
    expect(props.error).toBe("connect ECONNREFUSED")
    expect(props.proxy).toBeUndefined()
  })

  test("local loopback direct transport ignores env proxy", async () => {
    process.env.HTTP_PROXY = "http://proxy.corp:3128"
    const sink = collect()
    await ApiLog.trace(
      { provider: "local", model: "qwen2.5-coder:7b", url: "http://127.0.0.1:11434/api/generate", direct: true },
      async () => new Response("ok", { status: 200 }),
    )
    sink.stop()
    expect(sink.events[0]!.properties.proxy).toBeUndefined()
  })

  test("passthrough without logging when disabled", async () => {
    delete process.env.KILO_API_LOG
    const sink = collect()
    const res = await ApiLog.trace(
      { provider: "kilo", model: "codestral-2508", url: "https://api.kilo.ai/fim/completions" },
      async () => new Response("ok", { status: 200 }),
    )
    sink.stop()
    expect(res.status).toBe(200)
    expect(sink.events.length).toBe(0)
  })
})
