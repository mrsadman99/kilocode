import { describe, it, expect, afterEach, beforeEach } from "bun:test"
import * as vscode from "vscode"
import { createKiloClient } from "@kilocode/sdk/v2/client"
import { customFimOptions, customPrompt, type CustomFimOptions } from "../../src/services/autocomplete/custom-fim"
import { generateFim } from "../../src/services/autocomplete/fim"

type Stub = {
  getConfiguration: (section?: string) => {
    get: <T>(key: string, fallback?: T) => T | undefined
  }
}

const original = vscode.workspace.getConfiguration

function stubConfig(state: Map<string, unknown>) {
  ;(vscode.workspace as unknown as Stub).getConfiguration = (section?: string) => {
    if (section !== "kilo-code.new.autocomplete") {
      return { get: <T>(_key: string, fallback?: T) => fallback }
    }
    return {
      get: <T>(key: string, fallback?: T) => (state.has(key) ? (state.get(key) as T) : fallback),
    }
  }
}

afterEach(() => {
  ;(vscode.workspace as unknown as Stub).getConfiguration = original as Stub["getConfiguration"]
})

describe("customFimOptions", () => {
  let state: Map<string, unknown>

  beforeEach(() => {
    state = new Map()
    stubConfig(state)
  })

  it("defaults to empty values (no base URL, no auth, no proxy) and OpenAI format", () => {
    expect(customFimOptions()).toEqual({ baseURL: "", apiKey: "", proxy: "", format: "openai", template: "auto" })
  })

  it("reads and trims the configured values", () => {
    state.set("customBaseURL", "  https://api.deepseek.com/beta/  ")
    state.set("customApiKey", "  sk-test  ")
    state.set("customProxy", "  http://127.0.0.1:5222  ")
    state.set("customFormat", "generate")
    state.set("customTemplate", "qwen")
    expect(customFimOptions()).toEqual({
      baseURL: "https://api.deepseek.com/beta/",
      apiKey: "sk-test",
      proxy: "http://127.0.0.1:5222",
      format: "generate",
      template: "qwen",
    })
  })

  it("treats whitespace-only values as unset", () => {
    state.set("customBaseURL", "   ")
    state.set("customApiKey", "   ")
    state.set("customProxy", "   ")
    state.set("customTemplate", "   ")
    expect(customFimOptions()).toEqual({ baseURL: "", apiKey: "", proxy: "", format: "openai", template: "auto" })
  })

  it("falls back to the OpenAI format for unknown values", () => {
    state.set("customFormat", "bogus")
    expect(customFimOptions().format).toBe("openai")
    state.set("customFormat", "completions")
    expect(customFimOptions().format).toBe("completions")
    state.set("customFormat", "chat")
    expect(customFimOptions().format).toBe("chat")
  })

  it("streams only assistant content from chat chunks through the generated FIM client", async () => {
    state.set("customBaseURL", "https://example.test/v1")
    state.set("customFormat", "chat")
    const events = [
      { choices: [{ delta: { role: "assistant" } }] },
      { choices: [{ delta: { content: "return " } }] },
      { choices: [{ delta: { content: "1" } }] },
      { choices: [], usage: { prompt_tokens: 24, completion_tokens: 2 } },
    ]
    const fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init)
        expect(new URL(req.url).pathname).toBe("/kilo/fim")
        expect(await req.json()).toMatchObject({
          provider: "custom",
          model: "Qwen3-Coder-Next",
          endpoint: "chat",
          suffix: "",
          system: expect.any(String),
        })
        return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
          headers: { "Content-Type": "text/event-stream" },
        })
      },
      { preconnect: globalThis.fetch.preconnect },
    )
    const client = createKiloClient({ baseUrl: "http://localhost", fetch })
    const chunks: string[] = []
    const usage = await generateFim(
      { getClientAsync: async () => client },
      "custom/Qwen3-Coder-Next",
      "p",
      "s",
      (chunk) => chunks.push(chunk),
    )
    expect(chunks).toEqual(["return ", "1"])
    expect(usage).toMatchObject({ inputTokens: 24, outputTokens: 2 })
  })
})

describe("Custom requests from the extension", () => {
  const opts: CustomFimOptions = {
    baseURL: "https://example.test/beta",
    apiKey: "",
    proxy: "",
    format: "openai",
    template: "auto",
  }
  const p = "def fib(n):\n    "
  const s = "\n    return n"

  it("leaves native FIM untouched even for an unknown server model alias", () => {
    const body = customPrompt(opts, "alias", p, s)
    expect(body).toMatchObject({ prefix: p, suffix: s })
    expect(body).not.toHaveProperty("endpoint")
    expect(body).not.toHaveProperty("system")
  })

  it("uses identical profile output for either raw transport, regardless of server location", () => {
    for (const format of ["completions", "generate"] as const) {
      const body = customPrompt({ ...opts, format, template: "qwen", apiKey: "test" }, "alias", p, s)
      expect(body).toMatchObject({
        endpoint: format,
        apiKey: "test",
        prefix: `<|fim_prefix|>${p}<|fim_suffix|>${s}<|fim_middle|>`,
        suffix: "",
      })
      expect(body).not.toHaveProperty("system")
    }
  })

  it("requires explicit profile for unknown checkpoints, without blocking native suffix requests", () => {
    for (const format of ["chat", "completions", "generate"] as const) {
      expect(() => customPrompt({ ...opts, format }, "my-server-alias", p, s)).toThrow()
    }
  })

  it("preserves the raw Ollama default, but never sends a key to an implicit host", () => {
    const local = { ...opts, format: "generate" as const, baseURL: "" }
    expect(customPrompt(local, "", p, s)).toMatchObject({
      endpoint: "generate",
      prefix: `<|fim_prefix|>${p}<|fim_suffix|>${s}<|fim_middle|>`,
    })
    expect(() => customPrompt({ ...local, apiKey: "test" }, "", p, s)).toThrow(/base URL/)
  })

  it("sends the rendered user content and profile system instruction separately for Qwen3-Coder-Next chat", () => {
    expect(customPrompt({ ...opts, format: "chat" }, "Qwen/Qwen3-Coder-Next", p, s)).toMatchObject({
      endpoint: "chat",
      prefix: `<|fim_prefix|>${p}<|fim_suffix|>${s}<|fim_middle|>`,
      suffix: "",
      system: expect.any(String),
    })
  })
})
