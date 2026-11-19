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

describe("provider-scoped model resolution", () => {
  test("keeps an unknown Kilo Gateway model within the gateway", () => {
    const info = getAutocompleteModel("kilo", "inception/mercury-next-edit")
    expect(info?.providerID).toBe("kilo")
    expect(info?.modelID).toBe("inception/mercury-next-edit")
    expect(getAutocompleteModelById("kilo/custom/fim-model")?.modelID).toBe("custom/fim-model")
  })

  test("never substitutes a different provider for an explicit choice", () => {
    // Unknown model under a direct BYOK provider is rejected, not routed to kilo.
    expect(getAutocompleteModel("mistral", "опечатка")).toBeUndefined()
    expect(getAutocompleteModel("mistral", "mistralai/codestral-2508")).toBeUndefined()
    // Unset model under mistral resolves to mistral's own default, not kilo.
    const mistral = getAutocompleteModel("mistral")
    expect(mistral?.providerID).toBe("mistral")
    expect(mistral?.modelID).toBe("codestral-2508")
  })

  test("explicit unsupported provider resolves to undefined instead of the cloud default", () => {
    expect(getAutocompleteModel("inception", "mercury-edit-2")).toBeUndefined()
    expect(getAutocompleteModel("ollama", "qwen2.5-coder:7b")).toBeUndefined()
    expect(getAutocompleteModelById("inception/mercury-edit-2")).toBeUndefined()
  })

  test("unset provider still resolves to the default", () => {
    expect(getAutocompleteModel()).toBe(DEFAULT_AUTOCOMPLETE_MODEL)
    expect(getAutocompleteModel(undefined, "anything")).toBe(DEFAULT_AUTOCOMPLETE_MODEL)
    expect(getAutocompleteModel("kilo")).toBe(DEFAULT_AUTOCOMPLETE_MODEL)
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
