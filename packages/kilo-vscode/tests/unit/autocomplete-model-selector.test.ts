import { describe, expect, it } from "vitest"
import {
  AUTOCOMPLETE_SELECTOR_MODELS,
  getAutocompleteSelection,
} from "../../webview-ui/src/components/settings/autocomplete-model-selector"
import { AUTOCOMPLETE_MODELS, CUSTOM_PROVIDER_LABEL } from "../../src/shared/autocomplete-models"

describe("autocomplete model selector", () => {
  it("shows autocomplete models grouped by their configured provider", () => {
    expect(AUTOCOMPLETE_SELECTOR_MODELS).toEqual([
      ...AUTOCOMPLETE_MODELS.map((m) => ({
        id: m.modelID,
        name: m.label,
        providerID: m.providerID,
        providerName: m.provider,
      })),
      { id: "custom", name: "Custom FIM model", providerID: "custom", providerName: CUSTOM_PROVIDER_LABEL },
    ])
  })

  it("maps the custom provider to the custom selector entry", () => {
    expect(getAutocompleteSelection("custom", "deepseek-chat")).toEqual({ providerID: "custom", modelID: "custom" })
    expect(getAutocompleteSelection("custom")).toEqual({ providerID: "custom", modelID: "custom" })
  })

  it("maps the legacy local provider to the same custom entry", () => {
    expect(getAutocompleteSelection("local", "qwen2.5-coder:7b")).toEqual({ providerID: "custom", modelID: "custom" })
    expect(getAutocompleteSelection("local")).toEqual({ providerID: "custom", modelID: "custom" })
  })

  it("returns null when nothing is selected", () => {
    expect(getAutocompleteSelection()).toBeNull()
  })
})
