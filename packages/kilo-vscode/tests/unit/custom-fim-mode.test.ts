import { describe, expect, it } from "vitest"
import {
  formatForMode,
  modeFromFormat,
  profileOptions,
  resolveAutoProfile,
  transportFromFormat,
} from "../../webview-ui/src/components/settings/custom-fim-mode"
import { FIM_TEMPLATE_IDS } from "../../src/shared/autocomplete-models"

describe("custom input mode mapping", () => {
  it("maps the persisted format to a user-facing mode", () => {
    expect(modeFromFormat("openai")).toBe("native")
    expect(modeFromFormat("completions")).toBe("raw")
    expect(modeFromFormat("generate")).toBe("raw")
    expect(modeFromFormat("chat")).toBe("chat")
  })

  it("treats an unknown or unset format as native", () => {
    expect(modeFromFormat(undefined)).toBe("native")
    expect(modeFromFormat(null)).toBe("native")
    expect(modeFromFormat("bogus")).toBe("native")
  })

  it("round-trips a mode and transport back to the persisted format", () => {
    expect(formatForMode("native", "completions")).toBe("openai")
    expect(formatForMode("raw", "completions")).toBe("completions")
    expect(formatForMode("raw", "generate")).toBe("generate")
    expect(formatForMode("chat", "completions")).toBe("chat")
  })

  it("maps the persisted format to a raw transport", () => {
    expect(transportFromFormat("generate")).toBe("generate")
    expect(transportFromFormat("completions")).toBe("completions")
    expect(transportFromFormat("openai")).toBe("completions")
    expect(transportFromFormat(undefined)).toBe("completions")
  })
})

describe("FIM profile options", () => {
  it("prepends Auto and lists every registry profile", () => {
    const options = profileOptions("Auto")
    expect(options[0]).toEqual({ value: "auto", label: "Auto" })
    expect(options.map((o) => o.value)).toEqual(["auto", ...FIM_TEMPLATE_IDS])
    expect(options.length).toBe(FIM_TEMPLATE_IDS.length + 1)
  })

  it("omits raw-only base models from the chat selector but keeps chat-capable ones", () => {
    const values = profileOptions("Auto", true).map((o) => o.value)
    expect(values).toContain("auto")
    expect(values).toContain("qwen3")
    expect(values).toContain("codegeex")
    expect(values).not.toContain("qwen")
    expect(values).not.toContain("starcoder")
    expect(values).not.toContain("mellum")
    expect(values).not.toContain("deepseek")
  })
})

describe("resolveAutoProfile", () => {
  it("returns explicit when a concrete profile is selected", () => {
    expect(resolveAutoProfile("starcoder", "anything", false)).toEqual({ kind: "explicit" })
  })

  it("resolves a blank raw model to the default checkpoint", () => {
    const res = resolveAutoProfile("auto", "", false)
    expect(res.kind).toBe("resolved")
    if (res.kind === "resolved") {
      expect(res.id).toBe("qwen")
      expect(res.label).toBe("Qwen2.5-Coder")
    }
  })

  it("resolves a matching model name to its profile", () => {
    const res = resolveAutoProfile("auto", "starcoder2:7b", false)
    expect(res.kind).toBe("resolved")
    if (res.kind === "resolved") expect(res.id).toBe("starcoder")
  })

  it("marks a blank chat model as unconfigured instead of assuming a profile", () => {
    expect(resolveAutoProfile("auto", "", true)).toEqual({ kind: "unconfigured" })
  })

  it("marks an unrecognized model as unknown so the user picks explicitly", () => {
    const res = resolveAutoProfile("auto", "some-unknown-model", false)
    expect(res.kind).toBe("unknown")
    if (res.kind === "unknown") expect(res.model).toBe("some-unknown-model")
  })

  it("flags a raw-only base model in chat mode as needing an explicit chat-capable profile", () => {
    expect(resolveAutoProfile("auto", "starcoder2:7b", true).kind).toBe("unknown")
    expect(resolveAutoProfile("auto", "Qwen3-Coder-Next", true).kind).toBe("resolved")
  })
})
