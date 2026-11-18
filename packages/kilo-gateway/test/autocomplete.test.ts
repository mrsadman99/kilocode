import { describe, expect, test } from "bun:test"
import {
  AUTOCOMPLETE_MODELS,
  DEFAULT_AUTOCOMPLETE_MODEL,
  DEFAULT_AUTOCOMPLETE_MODEL_ID,
  DEFAULT_AUTOCOMPLETE_PROVIDER_ID,
  DEFAULT_LOCAL_BASE_URL,
  DEFAULT_LOCAL_MODEL,
  getAutocompleteModel,
  getAutocompleteModelById,
  validAutocompleteModel,
  validAutocompleteProvider,
  validFimTemplate,
  validLocalFimEndpoint,
} from "../src/autocomplete"

describe("DEFAULT_AUTOCOMPLETE_MODEL", () => {
  test("resolves to Codestral through Kilo Gateway", () => {
    const match = AUTOCOMPLETE_MODELS.find(
      (m) => m.providerID === DEFAULT_AUTOCOMPLETE_PROVIDER_ID && m.modelID === DEFAULT_AUTOCOMPLETE_MODEL_ID,
    )
    expect(DEFAULT_AUTOCOMPLETE_PROVIDER_ID).toBe("kilo")
    expect(DEFAULT_AUTOCOMPLETE_MODEL_ID).toBe("mistralai/codestral-2508")
    expect(match).toBeDefined()
    expect(DEFAULT_AUTOCOMPLETE_MODEL).toBe(match!)
  })
})

describe("retired autocomplete models", () => {
  test("fall back to the default model", () => {
    expect(getAutocompleteModel("kilo", "inception/mercury-next-edit")).toBe(DEFAULT_AUTOCOMPLETE_MODEL)
    expect(getAutocompleteModel("inception", "mercury-edit-2")).toBe(DEFAULT_AUTOCOMPLETE_MODEL)
  })

  test("are not valid provider or model values", () => {
    expect(validAutocompleteProvider("inception")).toBe(false)
    expect(validAutocompleteModel("mercury-next-edit")).toBe(false)
  })
})

describe("local autocomplete models", () => {
  test("synthesizes a def for any local model name", () => {
    const info = getAutocompleteModel("local", "starcoder2:7b")
    expect(info.providerID).toBe("local")
    expect(info.modelID).toBe("starcoder2:7b")
    expect(info.requestModel).toBe("starcoder2:7b")
    expect(info.id).toBe("local/starcoder2:7b")
  })

  test("falls back to the default local model when unset", () => {
    expect(getAutocompleteModel("local").modelID).toBe(DEFAULT_LOCAL_MODEL)
    expect(getAutocompleteModel("local", "  ").modelID).toBe(DEFAULT_LOCAL_MODEL)
  })

  test("resolves local defs by combined id", () => {
    const info = getAutocompleteModelById("local/qwen2.5-coder:7b")
    expect(info.providerID).toBe("local")
    expect(info.modelID).toBe("qwen2.5-coder:7b")
  })

  test("local is a valid provider but not a whitelisted model", () => {
    expect(validAutocompleteProvider("local")).toBe(true)
    expect(validAutocompleteModel("qwen2.5-coder:7b")).toBe(false)
  })

  test("exposes local defaults", () => {
    expect(DEFAULT_LOCAL_BASE_URL).toBe("http://127.0.0.1:11434")
    expect(DEFAULT_LOCAL_MODEL).toBe("qwen2.5-coder:7b")
  })

  test("validates FIM templates and endpoints", () => {
    expect(validFimTemplate("starcoder")).toBe(true)
    expect(validFimTemplate("qwen")).toBe(true)
    expect(validFimTemplate("codellama")).toBe(true)
    expect(validFimTemplate("auto")).toBe(false)
    expect(validFimTemplate("codestral")).toBe(false)
    expect(validLocalFimEndpoint("completions")).toBe(true)
    expect(validLocalFimEndpoint("generate")).toBe(true)
    expect(validLocalFimEndpoint("auto")).toBe(false)
  })
})
