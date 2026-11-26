import { describe, expect, test } from "bun:test"
import { FIM_TEMPLATE_IDS, matchFimProfile, profiles, renderFim, resolveFimProfile } from "../src/autocomplete"

const P = "def fib(n):\n    "
const S = "\n    return n"

describe("FIM profile rendering (golden)", () => {
  test("qwen renders exact Qwen2.5-Coder markers and stop set", () => {
    expect(renderFim("qwen", P, S)).toEqual({
      prompt: `<|fim_prefix|>${P}<|fim_suffix|>${S}<|fim_middle|>`,
      stop: ["<|fim_prefix|>", "<|fim_suffix|>", "<|fim_middle|>", "<|endoftext|>", "<|file_sep|>"],
    })
  })

  test("starcoder renders BigCode markers without bars", () => {
    expect(renderFim("starcoder", P, S).prompt).toBe(`<fim_prefix>${P}<fim_suffix>${S}<fim_middle>`)
  })

  test("santacoder renders the hyphenated SantaCoder markers", () => {
    expect(renderFim("santacoder", P, S).prompt).toBe(`<fim-prefix>${P}<fim-suffix>${S}<fim-middle>`)
  })

  test("codellama renders the legacy spaced CodeLlama markers", () => {
    expect(renderFim("codellama", P, S).prompt).toBe(`<PRE> ${P} <SUF> ${S} <MID>`)
    expect(renderFim("codellama", P, S).stop).toEqual(["<PRE>", "<SUF>", "<MID>", "<EOT>"])
  })

  test("deepseek renders exact fullwidth-bar and low-block Unicode markers", () => {
    expect(renderFim("deepseek", P, S).prompt).toBe(`<｜fim▁begin｜>${P}<｜fim▁hole｜>${S}<｜fim▁end｜>`)
  })

  test("mellum is suffix-first and puts an optional filename before the markers", () => {
    expect(renderFim("mellum", P, S).prompt).toBe(`<fim_suffix>${S}<fim_prefix>${P}<fim_middle>`)
    expect(renderFim("mellum", P, S, false, "src/a.py").prompt).toBe(
      `<filename>src/a.py\n<fim_suffix>${S}<fim_prefix>${P}<fim_middle>`,
    )
  })

  test("seed is suffix-first with its own bracketed markers", () => {
    expect(renderFim("seed", P, S).prompt).toBe(`<[fim-suffix]>${S}<[fim-prefix]>${P}<[fim-middle]>`)
  })
})

describe("CodeGeeX role wrapper", () => {
  test("raw mode wraps in role tokens; chat mode omits them", () => {
    expect(renderFim("codegeex", P, S).prompt).toBe(
      `<|user|>\n<|code_suffix|>${S}<|code_prefix|>${P}<|code_middle|><|assistant|>\n`,
    )
    expect(renderFim("codegeex", P, S, true).prompt).toBe(`<|code_suffix|>${S}<|code_prefix|>${P}<|code_middle|>`)
    expect(renderFim("codegeex", P, S, true).system).toBeUndefined()
  })
})

describe("Qwen3-Coder-Next chat recipe", () => {
  test("chat emits the three Qwen markers as user content plus the documented system", () => {
    const rendered = renderFim("qwen3", P, S, true)
    expect(rendered.prompt).toBe(`<|fim_prefix|>${P}<|fim_suffix|>${S}<|fim_middle|>`)
    expect(rendered.system).toBe("You are a code completion assistant.")
  })

  test("raw mode drops the system and keeps only the markers", () => {
    expect(renderFim("qwen3", P, S).system).toBeUndefined()
    expect(renderFim("qwen3", P, S).prompt).toBe(`<|fim_prefix|>${P}<|fim_suffix|>${S}<|fim_middle|>`)
  })
})

describe("CodeGemma stop set", () => {
  test("keeps its own file-separator, end-of-turn and eos stops", () => {
    const { stop } = renderFim("codegemma", P, S)
    expect(stop).toContain("<|file_separator|>")
    expect(stop).toContain("<|end_of_turn|>")
    expect(stop).toContain("<eos>")
  })
})

describe("raw-only profiles", () => {
  test("base models refuse the chat transport", () => {
    for (const id of FIM_TEMPLATE_IDS) {
      if (profiles[id].rawOnly) expect(() => renderFim(id, P, S, true)).toThrow()
    }
  })

  test("every profile stops on its own middle marker", () => {
    for (const id of FIM_TEMPLATE_IDS) {
      const { stop } = renderFim(id, P, S)
      expect(stop).toContain(profiles[id].mid.trim())
    }
  })
})

describe("FIM profile matching", () => {
  test("matches checkpoint aliases and sizes without a blanket fallback", () => {
    expect(matchFimProfile("starcoder2:7b")).toBe("starcoder")
    expect(matchFimProfile("StarCoder2-15b")).toBe("starcoder")
    expect(matchFimProfile("stable-code-3b")).toBe("starcoder")
    expect(matchFimProfile("santacoder")).toBe("santacoder")
    expect(matchFimProfile("qwen2.5-coder:7b")).toBe("qwen")
    expect(matchFimProfile("qwen2-coder-7b")).toBe("qwen")
    expect(matchFimProfile("CodeQwen1.5-7B")).toBe("qwen")
    expect(matchFimProfile("Qwen/Qwen3-Coder-Next")).toBe("qwen3")
    expect(matchFimProfile("qwen3-coder-30b-a3b")).toBe("qwen3")
    expect(matchFimProfile("google/codegemma-7b")).toBe("codegemma")
    expect(matchFimProfile("codellama:7b")).toBe("codellama")
    expect(matchFimProfile("CodeLlama-13b")).toBe("codellama")
    expect(matchFimProfile("code-llama")).toBe("codellama")
    expect(matchFimProfile("deepseek-coder-6.7b-base")).toBe("deepseek")
    expect(matchFimProfile("deepseek-coder-v2-lite")).toBe("deepseek")
    expect(matchFimProfile("JetBrains/Mellum-4b-base")).toBe("mellum")
    expect(matchFimProfile("Seed-Coder-8B-Base")).toBe("seed")
    expect(matchFimProfile("codegeex4-all-9b")).toBe("codegeex")
  })

  test("does not match non-FIM or native-only names", () => {
    expect(matchFimProfile("deepseek-chat")).toBeUndefined()
    expect(matchFimProfile("qwen2.5:7b")).toBeUndefined()
    expect(matchFimProfile("llama-3-8b")).toBeUndefined()
    expect(matchFimProfile("codestral-2508")).toBeUndefined()
    expect(matchFimProfile("my-server-alias")).toBeUndefined()
  })
})

describe("FIM profile resolution", () => {
  test("an explicit known profile wins over inference", () => {
    expect(resolveFimProfile("starcoder", "qwen2.5-coder:7b")).toBe("starcoder")
    expect(resolveFimProfile("codegeex", "qwen2.5-coder:7b")).toBe("codegeex")
  })

  test("auto infers from the checkpoint name", () => {
    expect(resolveFimProfile("auto", "starcoder2:7b")).toBe("starcoder")
    expect(resolveFimProfile("auto", "qwen2.5-coder:7b")).toBe("qwen")
    expect(resolveFimProfile("auto", "codellama:7b")).toBe("codellama")
  })

  test("a blank model resolves to the legacy Qwen default", () => {
    expect(resolveFimProfile("auto", "")).toBe("qwen")
    expect(resolveFimProfile("", "   ")).toBe("qwen")
  })

  test("a legacy/unrecognized setting value falls back to inference", () => {
    expect(resolveFimProfile("codestral", "starcoder2:7b")).toBe("starcoder")
  })

  test("unknown models require an explicit profile instead of defaulting to Qwen", () => {
    expect(() => resolveFimProfile("auto", "my-server-alias")).toThrow()
    expect(() => resolveFimProfile("", "totally-unknown")).toThrow()
    expect(() => resolveFimProfile("auto", "llama-3-8b")).toThrow()
  })

  test("prototype-chain keys are not accepted as explicit profiles", () => {
    expect(() => resolveFimProfile("toString", "my-server-alias")).toThrow()
    expect(() => resolveFimProfile("constructor", "my-server-alias")).toThrow()
    expect(resolveFimProfile("hasOwnProperty", "qwen2.5-coder:7b")).toBe("qwen")
  })
})
