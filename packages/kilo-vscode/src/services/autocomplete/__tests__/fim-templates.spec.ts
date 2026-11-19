import { describe, expect, it } from "vitest"
import {
  codeLlamaTemplate,
  fimTemplates,
  inferFimTemplate,
  qwenTemplate,
  starcoderTemplate,
} from "../continuedev/core/autocomplete/templating/AutocompleteTemplate"

describe("local FIM templates", () => {
  it("wraps prefix and suffix with StarCoder tokens", () => {
    expect(starcoderTemplate.template("def f():", "\n    return 1", "", "", "", [], [])).toBe(
      "<fim_prefix>def f():<fim_suffix>\n    return 1<fim_middle>",
    )
    expect(starcoderTemplate.completionOptions.stop).toContain("<fim_middle>")
  })

  it("wraps prefix and suffix with Qwen tokens", () => {
    expect(qwenTemplate.template("def f():", "\n    return 1", "", "", "", [], [])).toBe(
      "<|fim_prefix|>def f():<|fim_suffix|>\n    return 1<|fim_middle|>",
    )
    expect(qwenTemplate.completionOptions.stop).toContain("<|fim_middle|>")
  })

  it("wraps prefix and suffix with CodeLlama tokens", () => {
    expect(codeLlamaTemplate.template("def f():", "\n    return 1", "", "", "", [], [])).toBe(
      "<PRE> def f(): <SUF> \n    return 1 <MID>",
    )
    expect(codeLlamaTemplate.completionOptions.stop).toContain("<MID>")
  })

  it("exposes all templates in the registry", () => {
    expect(Object.keys(fimTemplates)).toEqual(["starcoder", "qwen", "codellama"])
  })

  it("infers the template from model names", () => {
    expect(inferFimTemplate("starcoder2:7b")).toBe("starcoder")
    expect(inferFimTemplate("StarCoder2-15b")).toBe("starcoder")
    expect(inferFimTemplate("qwen2.5-coder:7b")).toBe("qwen")
    expect(inferFimTemplate("codellama:7b")).toBe("codellama")
    expect(inferFimTemplate("CodeLlama-13b")).toBe("codellama")
    expect(inferFimTemplate("some-unknown-model")).toBe("qwen")
  })
})
