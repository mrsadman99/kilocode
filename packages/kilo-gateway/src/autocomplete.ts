export type AutocompleteProviderID = "kilo" | "mistral" | "local"
export type DirectAutocompleteProviderID = Exclude<AutocompleteProviderID, "kilo" | "local">

/** FIM prompt templates for local models, assembled client-side. */
export type FimTemplateID = "starcoder" | "qwen" | "codellama"
export const FIM_TEMPLATE_IDS: readonly FimTemplateID[] = ["starcoder", "qwen", "codellama"]

/** Local server API used for FIM requests. */
export type LocalFimEndpoint = "completions" | "generate"
export const LOCAL_FIM_ENDPOINTS: readonly LocalFimEndpoint[] = ["completions", "generate"]

export const DEFAULT_LOCAL_MODEL = "qwen2.5-coder:7b"
export const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:11434"
export const LOCAL_PROVIDER_LABEL = "Local (Ollama)"

export interface AutocompleteModelDef {
  /** Stable combined value for internal comparisons. */
  readonly id: string
  /** Model value stored in settings and sent to the autocomplete API. */
  readonly modelID: string
  /** Human-readable label shown in settings. */
  readonly label: string
  /** Provider value stored in settings and used by the selector group. */
  readonly providerID: AutocompleteProviderID
  /** Provider display name for status bar / telemetry. */
  readonly provider: string
  /** Full model ID sent upstream by the autocomplete route. */
  readonly requestModel: string
  /** Provider key to use for direct BYOK. Empty means Kilo Gateway. */
  readonly directProvider?: DirectAutocompleteProviderID
  /** Request temperature. */
  readonly temperature: number
}

const models: AutocompleteModelDef[] = [
  {
    id: "kilo/mistralai/codestral-2508",
    modelID: "mistralai/codestral-2508",
    label: "Codestral",
    providerID: "kilo",
    provider: "Kilo Gateway",
    requestModel: "mistralai/codestral-2508",
    temperature: 0.2,
  },
  {
    id: "mistral/codestral-2508",
    modelID: "codestral-2508",
    label: "Codestral",
    providerID: "mistral",
    provider: "Mistral",
    requestModel: "codestral-2508",
    directProvider: "mistral",
    temperature: 0.2,
  },
]

export const AUTOCOMPLETE_MODELS: readonly AutocompleteModelDef[] = models

export const DEFAULT_AUTOCOMPLETE_PROVIDER_ID: AutocompleteProviderID = "kilo"
export const DEFAULT_AUTOCOMPLETE_MODEL_ID = "mistralai/codestral-2508"

export const DEFAULT_AUTOCOMPLETE_MODEL: AutocompleteModelDef = (() => {
  const found = models.find(
    (m) => m.providerID === DEFAULT_AUTOCOMPLETE_PROVIDER_ID && m.modelID === DEFAULT_AUTOCOMPLETE_MODEL_ID,
  )
  if (!found) {
    throw new Error(
      `DEFAULT_AUTOCOMPLETE_MODEL not found: provider=${DEFAULT_AUTOCOMPLETE_PROVIDER_ID} model=${DEFAULT_AUTOCOMPLETE_MODEL_ID}`,
    )
  }
  return found
})()

/** Local models are user-defined, so their defs are synthesized instead of whitelisted. */
function localModel(model?: string): AutocompleteModelDef {
  const name = model?.trim() || DEFAULT_LOCAL_MODEL
  return {
    id: `local/${name}`,
    modelID: name,
    label: name,
    providerID: "local",
    provider: LOCAL_PROVIDER_LABEL,
    requestModel: name,
    temperature: 0.2,
  }
}

export function getAutocompleteModel(provider?: string, model?: string): AutocompleteModelDef {
  // When provider is unset, always default to Kilo Gateway. Direct-provider
  // use must be opted into explicitly via the provider setting — never inferred
  // from a model name, since the same plain model id can exist on multiple
  // providers and we don't want to silently route legacy settings to BYOK.
  const pid = provider ?? "kilo"
  if (pid === "local") return localModel(model)
  for (const m of models) {
    if (m.providerID === pid && m.modelID === model) return m
  }
  return DEFAULT_AUTOCOMPLETE_MODEL
}

export function getAutocompleteModelById(id: string): AutocompleteModelDef {
  if (id.startsWith("local/")) return localModel(id.slice("local/".length))
  for (const m of models) {
    if (m.id === id) return m
  }
  return DEFAULT_AUTOCOMPLETE_MODEL
}

export function validAutocompleteProvider(value: unknown) {
  if (typeof value !== "string") return false
  if (value === "local") return true
  return models.some((m) => m.providerID === value)
}

export function validAutocompleteModel(value: unknown) {
  if (typeof value !== "string") return false
  return models.some((m) => m.modelID === value)
}

export function validFimTemplate(value: unknown) {
  if (typeof value !== "string") return false
  return FIM_TEMPLATE_IDS.includes(value as FimTemplateID)
}

export function validLocalFimEndpoint(value: unknown) {
  if (typeof value !== "string") return false
  return LOCAL_FIM_ENDPOINTS.includes(value as LocalFimEndpoint)
}
