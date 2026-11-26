import { resolveKiloGatewayUrl } from "./api/url.js"
import {
  DEFAULT_AUTOCOMPLETE_MODEL,
  DEFAULT_LOCAL_BASE_URL,
  DEFAULT_LOCAL_MODEL,
  getAutocompleteModel,
  type DirectAutocompleteProviderID,
  type LocalFimEndpoint,
} from "./autocomplete.js"

export { requestMistralFim } from "./mistral-fim-endpoint.js"

export const DIRECT_FIM_ENV: Record<DirectAutocompleteProviderID, string[]> = {
  mistral: ["MISTRAL_API_KEY"],
}

export type FimEndpoint = LocalFimEndpoint | "chat"

export type FimTarget =
  | { provider: "kilo"; model: string; url: string }
  | { provider: "mistral"; model: string }
  | { provider: "local"; model: string; url: string; endpoint: LocalFimEndpoint; apiKey?: string }
  | { provider: "custom"; model: string; url: string; apiKey?: string }
  | { provider: "custom"; model: string; url: string; endpoint: "chat"; apiKey?: string }

export interface FimOptions {
  baseURL?: string
  endpoint?: FimEndpoint
  /** Custom provider only: Bearer key; omitted/empty means no Authorization header. */
  apiKey?: string
}

const KILO_FIM_URL = resolveKiloGatewayUrl("fim/completions")

function kiloTarget(model?: string): FimTarget {
  return { provider: "kilo", model: model ?? DEFAULT_AUTOCOMPLETE_MODEL.requestModel, url: KILO_FIM_URL }
}

function localTarget(model?: string, opts?: FimOptions, auth = false): FimTarget {
  const base = (opts?.baseURL?.trim() || DEFAULT_LOCAL_BASE_URL).replace(/\/+$/, "")
  const endpoint = opts?.endpoint === "completions" ? "completions" : "generate"
  const path = endpoint === "generate" ? "api/generate" : "v1/completions"
  // Only send the custom API key to an explicitly configured host, never the
  // implicit default (local Ollama) — avoids leaking the key to localhost.
  const apiKey = auth && opts?.baseURL?.trim() ? opts?.apiKey?.trim() : undefined
  return {
    provider: "local",
    model: model?.trim() || DEFAULT_LOCAL_MODEL,
    url: `${base}/${path}`,
    endpoint,
    ...(apiKey ? { apiKey } : {}),
  }
}

/** OpenAI-compatible FIM: POST {baseURL}/completions with native prompt+suffix. */
function customTarget(model?: string, opts?: FimOptions): FimTarget | undefined {
  const base = opts?.baseURL?.trim().replace(/\/+$/, "")
  if (!base) return undefined
  const apiKey = opts?.apiKey?.trim()
  return { provider: "custom", model: model?.trim() ?? "", url: `${base}/completions`, ...(apiKey ? { apiKey } : {}) }
}

/** OpenAI chat-completions transport: POST {baseURL}/chat/completions with a messages array. */
function customChatTarget(model?: string, opts?: FimOptions): FimTarget | undefined {
  const base = opts?.baseURL?.trim().replace(/\/+$/, "")
  if (!base) return undefined
  const apiKey = opts?.apiKey?.trim()
  return {
    provider: "custom",
    model: model?.trim() ?? "",
    url: `${base}/chat/completions`,
    endpoint: "chat",
    ...(apiKey ? { apiKey } : {}),
  }
}

/**
 * Resolve the upstream FIM target. Returns `undefined` for an explicit but
 * unsupported provider so the request is rejected rather than silently sent
 * to the cloud default with the user's code.
 */
export function resolveFimTarget(provider?: string, model?: string, opts?: FimOptions): FimTarget | undefined {
  const pid = provider?.trim()
  if (pid === "local") {
    if (opts?.endpoint === "chat") return undefined
    return localTarget(model, opts)
  }
  if (pid === "custom") {
    // Templated custom formats reuse the local server protocol (client-side FIM
    // wrapping, /v1/completions or /api/generate); the native OpenAI FIM format
    // posts prompt+suffix to {baseURL}/completions; chat posts a messages array
    // to {baseURL}/chat/completions.
    if (opts?.endpoint === "chat") return customChatTarget(model, opts)
    if (opts?.endpoint) return localTarget(model, opts, true)
    return customTarget(model, opts)
  }
  if (!pid || pid === "kilo") return kiloTarget(model)

  const info = getAutocompleteModel(pid, model)
  if (!info) return undefined
  if (info.directProvider === "mistral") {
    return { provider: "mistral", model: info.requestModel }
  }
  return kiloTarget(info.requestModel)
}
