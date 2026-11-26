import { describe, expect, it } from "vitest"
import {
  FIM_TEMPLATE_IDS,
  matchFimProfile,
  profiles,
  renderFim,
  resolveFimProfile,
} from "../continuedev/core/autocomplete/templating/AutocompleteTemplate"

describe("FIM profile registry (extension re-export)", () => {
  it("renders prefix-first and suffix-first holes with exact markers", () => {
    expect(renderFim("qwen", "a", "b").prompt).toBe("<|fim_prefix|>a<|fim_suffix|>b<|fim_middle|>")
    expect(renderFim("starcoder", "a", "b").prompt).toBe("<fim_prefix>a<fim_suffix>b<fim_middle>")
    expect(renderFim("codellama", "a", "b").prompt).toBe("<PRE> a <SUF> b <MID>")
    expect(renderFim("mellum", "a", "b").prompt).toBe("<fim_suffix>b<fim_prefix>a<fim_middle>")
    expect(renderFim("seed", "a", "b").prompt).toBe("<[fim-suffix]>b<[fim-prefix]>a<[fim-middle]>")
  })

  it("stops on each profile's boundary markers", () => {
    for (const id of FIM_TEMPLATE_IDS) {
      expect(renderFim(id, "a", "b").stop).toContain(profiles[id].mid.trim())
    }
  })

  it("matches concrete checkpoint names without a blanket fallback", () => {
    expect(matchFimProfile("starcoder2:7b")).toBe("starcoder")
    expect(matchFimProfile("qwen2.5-coder:7b")).toBe("qwen")
    expect(matchFimProfile("Qwen3-Coder-Next")).toBe("qwen3")
    expect(matchFimProfile("codellama:7b")).toBe("codellama")
    expect(matchFimProfile("some-unknown-model")).toBeUndefined()
  })

  it("requires an explicit profile for unknown models instead of assuming Qwen", () => {
    expect(resolveFimProfile("auto", "qwen2.5-coder:7b")).toBe("qwen")
    expect(resolveFimProfile("starcoder", "qwen2.5-coder:7b")).toBe("starcoder")
    expect(() => resolveFimProfile("auto", "some-unknown-model")).toThrow()
  })

  it("keeps CodeGeeX chat-capable without role wrappers and Qwen3 chat system", () => {
    expect(renderFim("codegeex", "a", "b", true).prompt).toBe("<|code_suffix|>b<|code_prefix|>a<|code_middle|>")
    expect(renderFim("qwen3", "a", "b", true).system).toBeTruthy()
  })
})
