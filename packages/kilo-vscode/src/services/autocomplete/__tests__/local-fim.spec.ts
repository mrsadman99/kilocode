import { beforeEach, describe, expect, it, vi } from "vitest"

const state = new Map<string, unknown>()

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, fallback: unknown) => state.get(key) ?? fallback),
    })),
  },
}))

describe("localFimOptions", () => {
  beforeEach(() => {
    state.clear()
  })

  it("defaults to the Qwen template on Ollama generate", async () => {
    const { localFimOptions } = await import("../local-fim")
    const opts = localFimOptions("qwen2.5-coder:7b")

    expect(opts.baseURL).toBe("http://127.0.0.1:11434")
    expect(opts.endpoint).toBe("generate")
    expect(opts.wrap("a", "b")).toBe("<|fim_prefix|>a<|fim_suffix|>b<|fim_middle|>")
    expect(opts.stop).toContain("<|fim_middle|>")
  })

  it("infers StarCoder and its completions endpoint from the model name", async () => {
    const { localFimOptions } = await import("../local-fim")
    const opts = localFimOptions("starcoder2:7b")

    expect(opts.endpoint).toBe("completions")
    expect(opts.wrap("a", "b")).toBe("<fim_prefix>a<fim_suffix>b<fim_middle>")
  })

  it("infers CodeLlama from the model name", async () => {
    const { localFimOptions } = await import("../local-fim")
    const opts = localFimOptions("codellama:7b")

    expect(opts.endpoint).toBe("generate")
    expect(opts.wrap("a", "b")).toBe("<PRE> a <SUF> b <MID>")
  })

  it("honors an explicit template override", async () => {
    state.set("localTemplate", "starcoder")
    const { localFimOptions } = await import("../local-fim")
    const opts = localFimOptions("qwen2.5-coder:7b")

    expect(opts.wrap("a", "b")).toBe("<fim_prefix>a<fim_suffix>b<fim_middle>")
    expect(opts.endpoint).toBe("completions")
  })

  it("honors an explicit endpoint override", async () => {
    state.set("localEndpoint", "completions")
    const { localFimOptions } = await import("../local-fim")

    expect(localFimOptions("qwen2.5-coder:7b").endpoint).toBe("completions")
  })

  it("honors a custom base URL", async () => {
    state.set("localBaseURL", "http://192.168.1.10:1234/")
    const { localFimOptions } = await import("../local-fim")

    expect(localFimOptions("qwen2.5-coder:7b").baseURL).toBe("http://192.168.1.10:1234/")
  })

  it("falls back to inference for invalid template values", async () => {
    state.set("localTemplate", "codestral")
    const { localFimOptions } = await import("../local-fim")

    expect(localFimOptions("starcoder2:7b").wrap("a", "b")).toBe("<fim_prefix>a<fim_suffix>b<fim_middle>")
  })
})
