import { describe, expect, test } from "bun:test"
import { resolveFimTarget } from "../src/fim"

describe("FIM target resolution", () => {
  test("keeps gateway autocomplete models on Kilo Gateway", () => {
    expect(resolveFimTarget("kilo", "mistralai/codestral-2508")).toEqual({
      provider: "kilo",
      model: "mistralai/codestral-2508",
      url: "https://ai-gateway.kilo.ai/api/v1/fim/completions",
    })
  })

  test("routes explicit provider autocomplete models directly", () => {
    expect(resolveFimTarget("mistral", "codestral-2508")).toEqual({
      provider: "mistral",
      model: "codestral-2508",
    })
  })

  test("keeps an unset Mistral model on Mistral, not the cloud default", () => {
    expect(resolveFimTarget("mistral")).toEqual({ provider: "mistral", model: "codestral-2508" })
    expect(resolveFimTarget("mistral", "unknown-model")).toBeUndefined()
  })

  test("rejects explicit unsupported providers instead of routing to the cloud default", () => {
    expect(resolveFimTarget("inception", "mercury-edit-2")).toBeUndefined()
    expect(resolveFimTarget("ollama", "qwen2.5-coder:7b")).toBeUndefined()
  })

  test("preserves gateway model pass-through behavior", () => {
    expect(resolveFimTarget()).toEqual({
      provider: "kilo",
      model: "mistralai/codestral-2508",
      url: "https://ai-gateway.kilo.ai/api/v1/fim/completions",
    })
    expect(resolveFimTarget(undefined, "mistralai/codestral-2508")).toEqual({
      provider: "kilo",
      model: "mistralai/codestral-2508",
      url: "https://ai-gateway.kilo.ai/api/v1/fim/completions",
    })
    expect(resolveFimTarget("kilo", "custom/fim-model")).toEqual({
      provider: "kilo",
      model: "custom/fim-model",
      url: "https://ai-gateway.kilo.ai/api/v1/fim/completions",
    })
  })
})

describe("local FIM target resolution", () => {
  test("defaults to Ollama native generate endpoint", () => {
    expect(resolveFimTarget("local", "qwen2.5-coder:7b")).toEqual({
      provider: "local",
      model: "qwen2.5-coder:7b",
      url: "http://127.0.0.1:11434/api/generate",
      endpoint: "generate",
    })
  })

  test("uses the OpenAI-compatible completions endpoint when requested", () => {
    expect(resolveFimTarget("local", "starcoder2:7b", { endpoint: "completions" })).toEqual({
      provider: "local",
      model: "starcoder2:7b",
      url: "http://127.0.0.1:11434/v1/completions",
      endpoint: "completions",
    })
  })

  test("honors a custom base URL and strips trailing slashes", () => {
    expect(resolveFimTarget("local", "codellama:7b", { baseURL: "http://192.168.1.10:11434/" })).toEqual({
      provider: "local",
      model: "codellama:7b",
      url: "http://192.168.1.10:11434/api/generate",
      endpoint: "generate",
    })
  })

  test("falls back to the default local model when unset", () => {
    expect(resolveFimTarget("local").model).toBe("qwen2.5-coder:7b")
  })
})

describe("custom FIM target resolution", () => {
  test("posts to {baseURL}/completions and strips trailing slashes", () => {
    expect(resolveFimTarget("custom", "deepseek-chat", { baseURL: "https://api.deepseek.com/beta/" })).toEqual({
      provider: "custom",
      model: "deepseek-chat",
      url: "https://api.deepseek.com/beta/completions",
    })
  })

  test("trims the model and keeps an optional Bearer key", () => {
    expect(
      resolveFimTarget("custom", "  deepseek-chat  ", { baseURL: "http://localhost:8000/v1", apiKey: "  sk-test  " }),
    ).toEqual({
      provider: "custom",
      model: "deepseek-chat",
      url: "http://localhost:8000/v1/completions",
      apiKey: "sk-test",
    })
  })

  test("omits the key when empty so requests go without Authorization", () => {
    const target = resolveFimTarget("custom", "m", { baseURL: "http://localhost:8000", apiKey: "   " })
    expect(target).toEqual({ provider: "custom", model: "m", url: "http://localhost:8000/completions" })
  })

  test("requires a base URL", () => {
    expect(resolveFimTarget("custom", "deepseek-chat")).toBeUndefined()
    expect(resolveFimTarget("custom", "deepseek-chat", { baseURL: "  " })).toBeUndefined()
  })

  test("templated formats reuse the local server protocol", () => {
    expect(resolveFimTarget("custom", "qwen2.5-coder:7b", { endpoint: "generate" })).toEqual({
      provider: "local",
      model: "qwen2.5-coder:7b",
      url: "http://127.0.0.1:11434/api/generate",
      endpoint: "generate",
    })
    expect(
      resolveFimTarget("custom", "starcoder2:7b", { baseURL: "http://192.168.1.10:8080/", endpoint: "completions" }),
    ).toEqual({
      provider: "local",
      model: "starcoder2:7b",
      url: "http://192.168.1.10:8080/v1/completions",
      endpoint: "completions",
    })
  })
})
