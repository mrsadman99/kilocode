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

export type FimTarget =
  | { provider: "kilo"; model: string; url: string }
  | { provider: "mistral"; model: string }
  | { provider: "local"; model: string; url: string; endpoint: LocalFimEndpoint }

export interface LocalFimOptions {
  baseURL?: string
  endpoint?: LocalFimEndpoint
}

const KILO_FIM_URL = resolveKiloGatewayUrl("fim/completions")

function kiloTarget(model?: string): FimTarget {
  return { provider: "kilo", model: model ?? DEFAULT_AUTOCOMPLETE_MODEL.requestModel, url: KILO_FIM_URL }
}

function localTarget(model?: string, opts?: LocalFimOptions): FimTarget {
  const base = (opts?.baseURL?.trim() || DEFAULT_LOCAL_BASE_URL).replace(/\/+$/, "")
  const endpoint = opts?.endpoint ?? "generate"
  const path = endpoint === "generate" ? "api/generate" : "v1/completions"
  return { provider: "local", model: model?.trim() || DEFAULT_LOCAL_MODEL, url: `${base}/${path}`, endpoint }
}

/**
 * Resolve the upstream FIM target. Returns `undefined` for an explicit but
 * unsupported provider so the request is rejected rather than silently sent
 * to the cloud default with the user's code.
 */
export function resolveFimTarget(provider?: string, model?: string, opts?: LocalFimOptions): FimTarget | undefined {
  const pid = provider?.trim()
  if (pid === "local") return localTarget(model, opts)
  if (!pid || pid === "kilo") return kiloTarget(model)

  const info = getAutocompleteModel(pid, model)
  if (!info) return undefined
  if (info.directProvider === "mistral") {
    return { provider: "mistral", model: info.requestModel }
  }
  return kiloTarget(info.requestModel)
}
