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
