import { describe, expect, it } from "vitest"
import {
  AUTOCOMPLETE_SELECTOR_MODELS,
  getAutocompleteSelection,
} from "../../webview-ui/src/components/settings/autocomplete-model-selector"
import { AUTOCOMPLETE_MODELS, LOCAL_PROVIDER_LABEL } from "../../src/shared/autocomplete-models"

describe("autocomplete model selector", () => {
  it("shows autocomplete models grouped by their configured provider", () => {
    expect(AUTOCOMPLETE_SELECTOR_MODELS).toEqual([
      ...AUTOCOMPLETE_MODELS.map((m) => ({
        id: m.modelID,
        name: m.label,
        providerID: m.providerID,
        providerName: m.provider,
      })),
      { id: "local", name: "Local FIM model", providerID: "local", providerName: LOCAL_PROVIDER_LABEL },
    ])
  })

  it("maps the local provider to the local selector entry", () => {
    expect(getAutocompleteSelection("local", "qwen2.5-coder:7b")).toEqual({ providerID: "local", modelID: "local" })
    expect(getAutocompleteSelection("local")).toEqual({ providerID: "local", modelID: "local" })
  })

  it("returns null when nothing is selected", () => {
    expect(getAutocompleteSelection()).toBeNull()
  })
})
