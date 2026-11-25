export type AutocompleteProviderID = "kilo" | "mistral" | "local" | "custom"
export type DirectAutocompleteProviderID = Exclude<AutocompleteProviderID, "kilo" | "local" | "custom">

/** Local server API used for FIM requests. */
export type LocalFimEndpoint = "completions" | "generate"
export const LOCAL_FIM_ENDPOINTS: readonly LocalFimEndpoint[] = ["completions", "generate"]

/** FIM prompt profiles for models whose hole must be encoded client-side. */
export type FimTemplateID =
  | "starcoder"
  | "santacoder"
  | "qwen"
  | "qwen3"
  | "codegemma"
  | "codellama"
  | "deepseek"
  | "mellum"
  | "seed"
  | "codegeex"
export const FIM_TEMPLATE_IDS: readonly FimTemplateID[] = [
  "qwen",
  "qwen3",
  "codegemma",
  "starcoder",
  "santacoder",
  "deepseek",
  "mellum",
  "seed",
  "codellama",
  "codegeex",
]

export function validFimTemplate(value: unknown) {
  if (typeof value !== "string") return false
  return FIM_TEMPLATE_IDS.includes(value as FimTemplateID)
}

export function validLocalFimEndpoint(value: unknown) {
  if (typeof value !== "string") return false
  return LOCAL_FIM_ENDPOINTS.includes(value as LocalFimEndpoint)
}

/**
 * A declarative FIM profile. The HTTP transport (native suffix, raw prompt, or
 * chat messages) is chosen separately; a profile only describes how to encode
 * the hole for a specific model family. `pre`/`suf`/`mid` are the literal
 * markers placed before the prefix, before the suffix, and at the generation
 * start respectively. `order` selects prefix-suffix-middle vs suffix-first.
 */
export interface FimProfile {
  label: string
  order: "psm" | "spm"
  pre: string
  suf: string
  mid: string
  stop: string[]
  /** Default local server API for the raw transport. */
  endpoint?: LocalFimEndpoint
  /** System instruction used only by the chat transport. */
  system?: string
  /** Supports an optional leading `<filename>` segment (Mellum). */
  filename?: boolean
  /** Raw role wrapper applied around the markers in raw-prompt mode (CodeGeeX). */
  wrap?: [string, string]
  /** Cannot be sent through the generic chat transport (would double-wrap). */
  rawOnly?: boolean
}

const QWEN_SYSTEM = "You are a code completion assistant."

export const profiles: Record<FimTemplateID, FimProfile> = {
  qwen: {
    label: "Qwen2.5-Coder",
    endpoint: "generate",
    order: "psm",
    pre: "<|fim_prefix|>",
    suf: "<|fim_suffix|>",
    mid: "<|fim_middle|>",
    stop: ["<|fim_prefix|>", "<|fim_suffix|>", "<|fim_middle|>", "<|endoftext|>", "<|file_sep|>"],
    rawOnly: true,
  },
  qwen3: {
    label: "Qwen3-Coder / Next",
    endpoint: "generate",
    order: "psm",
    pre: "<|fim_prefix|>",
    suf: "<|fim_suffix|>",
    mid: "<|fim_middle|>",
    stop: ["<|fim_prefix|>", "<|fim_suffix|>", "<|fim_middle|>", "<|endoftext|>"],
    system: QWEN_SYSTEM,
  },
  codegemma: {
    label: "CodeGemma",
    endpoint: "generate",
    order: "psm",
    pre: "<|fim_prefix|>",
    suf: "<|fim_suffix|>",
    mid: "<|fim_middle|>",
    stop: ["<|fim_prefix|>", "<|fim_suffix|>", "<|fim_middle|>", "<|file_separator|>", "<|end_of_turn|>", "<eos>"],
    rawOnly: true,
  },
  starcoder: {
    label: "StarCoder / StarCoder2 / Stable Code",
    endpoint: "completions",
    order: "psm",
    pre: "<fim_prefix>",
    suf: "<fim_suffix>",
    mid: "<fim_middle>",
    stop: ["<fim_prefix>", "<fim_suffix>", "<fim_middle>", "<|endoftext|>", "<file_sep>"],
    rawOnly: true,
  },
  santacoder: {
    label: "SantaCoder",
    endpoint: "completions",
    order: "psm",
    pre: "<fim-prefix>",
    suf: "<fim-suffix>",
    mid: "<fim-middle>",
    stop: ["<fim-prefix>", "<fim-suffix>", "<fim-middle>", "<|endoftext|>"],
    rawOnly: true,
  },
  deepseek: {
    label: "DeepSeek-Coder Base",
    endpoint: "completions",
    order: "psm",
    pre: "<｜fim▁begin｜>",
    suf: "<｜fim▁hole｜>",
    mid: "<｜fim▁end｜>",
    stop: ["<｜fim▁begin｜>", "<｜fim▁hole｜>", "<｜fim▁end｜>"],
    rawOnly: true,
  },
  mellum: {
    label: "JetBrains Mellum",
    endpoint: "completions",
    order: "spm",
    pre: "<fim_prefix>",
    suf: "<fim_suffix>",
    mid: "<fim_middle>",
    stop: ["<fim_prefix>", "<fim_suffix>", "<fim_middle>"],
    filename: true,
    rawOnly: true,
  },
  seed: {
    label: "Seed-Coder",
    endpoint: "completions",
    order: "spm",
    pre: "<[fim-prefix]>",
    suf: "<[fim-suffix]>",
    mid: "<[fim-middle]>",
    stop: ["<[fim-prefix]>", "<[fim-suffix]>", "<[fim-middle]>"],
    rawOnly: true,
  },
  codellama: {
    label: "CodeLlama",
    endpoint: "generate",
    order: "psm",
    pre: "<PRE> ",
    suf: " <SUF> ",
    mid: " <MID>",
    stop: ["<PRE>", "<SUF>", "<MID>", "<EOT>"],
    rawOnly: true,
  },
  codegeex: {
    label: "CodeGeeX4",
    endpoint: "completions",
    order: "spm",
    pre: "<|code_prefix|>",
    suf: "<|code_suffix|>",
    mid: "<|code_middle|>",
    stop: ["<|code_prefix|>", "<|code_suffix|>", "<|code_middle|>"],
    wrap: ["<|user|>\n", "<|assistant|>\n"],
  },
}

/** Match a concrete checkpoint name to a profile; returns undefined for unknown models. */
export function matchFimProfile(model: string): FimTemplateID | undefined {
  const name = model.toLowerCase()
  if (name.includes("santacoder")) return "santacoder"
  if (name.includes("starcoder") || name.includes("stable-code") || name.includes("stablecode")) return "starcoder"
  if (name.includes("codegemma")) return "codegemma"
  if (name.includes("qwen3-coder") || name.includes("qwen3coder")) return "qwen3"
  if (name.includes("qwen2.5-coder") || name.includes("qwen2-coder") || name.includes("codeqwen")) return "qwen"
  if (name.includes("deepseek-coder") || name.includes("deepseekcoder")) return "deepseek"
  if (name.includes("mellum")) return "mellum"
  if (name.includes("seed-coder") || name.includes("seedcoder")) return "seed"
  if (name.includes("codegeex")) return "codegeex"
  if (name.includes("codellama") || name.includes("code-llama") || name.includes("code_llama")) return "codellama"
  return undefined
}

/**
 * Resolve the profile to render. An explicit known profile wins; otherwise the
 * checkpoint name is matched. Unknown models throw instead of silently falling
 * back to Qwen markers, which would produce a valid request with a wrong prompt.
 */
export function resolveFimProfile(setting: string, model: string): FimTemplateID {
  if (setting && setting !== "auto" && Object.hasOwn(profiles, setting)) return setting as FimTemplateID
  const name = model?.trim() ?? ""
  if (!name) return "qwen"
  const inferred = matchFimProfile(name)
  if (inferred) return inferred
  throw new Error(
    `No FIM profile matches "${model}". Choose a profile explicitly in Settings → Models → Autocomplete.`,
  )
}

export interface RenderedFim {
  prompt: string
  stop: string[]
  system?: string
}

/**
 * Render the hole for a profile. In chat mode the markers become the user
 * message content (the server applies its own chat template); role wrappers and
 * the filename segment are raw-prompt concerns and are omitted.
 */
export function renderFim(
  id: FimTemplateID,
  prefix: string,
  suffix: string,
  chat = false,
  filename?: string,
): RenderedFim {
  const profile = profiles[id]
  const core =
    profile.order === "psm"
      ? profile.pre + prefix + profile.suf + suffix + profile.mid
      : profile.suf + suffix + profile.pre + prefix + profile.mid
  if (chat) {
    if (profile.rawOnly)
      throw new Error(`The ${profile.label} profile is raw-prompt only and cannot be sent as chat messages.`)
    return { prompt: core, stop: profile.stop, ...(profile.system ? { system: profile.system } : {}) }
  }
  let prompt = core
  if (profile.filename && filename) prompt = `<filename>${filename}\n${prompt}`
  if (profile.wrap) prompt = profile.wrap[0] + prompt + profile.wrap[1]
  return { prompt, stop: profile.stop }
}

export const DEFAULT_LOCAL_MODEL = "qwen2.5-coder:7b"
export const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:11434"
export const LOCAL_PROVIDER_LABEL = "Local (Ollama)"
export const CUSTOM_PROVIDER_LABEL = "Custom (OpenAI-compatible)"

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

/** The Gateway accepts arbitrary FIM model ids, so custom choices are preserved. */
function gatewayModel(model: string): AutocompleteModelDef {
  return {
    id: `kilo/${model}`,
    modelID: model,
    label: model,
    providerID: "kilo",
    provider: "Kilo Gateway",
    requestModel: model,
    temperature: 0.2,
  }
}

/** Custom OpenAI-compatible FIM endpoints accept arbitrary user-defined models. */
function customModel(model?: string): AutocompleteModelDef {
  const name = model?.trim() ?? ""
  return {
    id: `custom/${name}`,
    modelID: name,
    label: name,
    providerID: "custom",
    provider: CUSTOM_PROVIDER_LABEL,
    requestModel: name,
    temperature: 0.2,
  }
}

/**
 * Resolve the configured autocomplete model. The result always stays within
 * the explicitly chosen provider: an unsupported provider, or a model that
 * does not belong to a direct BYOK provider, resolves to `undefined` so the
 * caller surfaces a configuration error instead of routing the user's code to
 * a different service. Only an unset provider resolves to the cloud default.
 */
export function getAutocompleteModel(provider?: string, model?: string): AutocompleteModelDef | undefined {
  const pid = provider?.trim()
  if (!pid) return DEFAULT_AUTOCOMPLETE_MODEL
  if (pid === "local") return localModel(model)
  if (pid === "custom") return customModel(model)
  const owned = models.filter((m) => m.providerID === pid)
  if (owned.length === 0) return undefined
  const name = model?.trim()
  const found = name ? owned.find((m) => m.modelID === name) : undefined
  if (found) return found
  if (pid === "kilo") {
    // The Gateway accepts arbitrary FIM model ids; preserve the user's choice
    // rather than silently substituting a different model.
    return name ? gatewayModel(name) : DEFAULT_AUTOCOMPLETE_MODEL
  }
  // Direct BYOK providers only support their whitelisted models. An unset model
  // resolves to that provider's own default; an unknown model is rejected.
  return name ? undefined : owned[0]
}

export function getAutocompleteModelById(id: string): AutocompleteModelDef | undefined {
  if (id.startsWith("local/")) return localModel(id.slice("local/".length))
  if (id.startsWith("custom/")) return customModel(id.slice("custom/".length))
  const found = models.find((m) => m.id === id)
  if (found) return found
  if (id.startsWith("kilo/")) {
    const name = id.slice("kilo/".length)
    if (name) return gatewayModel(name)
  }
  return undefined
}

export function validAutocompleteProvider(value: unknown) {
  if (typeof value !== "string") return false
  if (value === "local" || value === "custom") return true
  return models.some((m) => m.providerID === value)
}

export function validAutocompleteModel(value: unknown) {
  if (typeof value !== "string") return false
  return models.some((m) => m.modelID === value)
}
