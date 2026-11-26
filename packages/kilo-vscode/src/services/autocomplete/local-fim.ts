import * as vscode from "vscode"
import {
  DEFAULT_LOCAL_BASE_URL,
  DEFAULT_LOCAL_MODEL,
  profiles,
  renderFim,
  resolveFimProfile,
  validLocalFimEndpoint,
  type FimTemplateID,
  type LocalFimEndpoint,
} from "../../shared/autocomplete-models"

export interface LocalFimOptions {
  baseURL: string
  endpoint: LocalFimEndpoint
  proxy: string
  stop: string[]
  wrap: (prefix: string, suffix: string) => string
}

/** Resolve local FIM settings: template (auto = infer from model name), endpoint (auto = template default). */
export function localFimOptions(model: string): LocalFimOptions {
  const cfg = vscode.workspace.getConfiguration("kilo-code.new.autocomplete")
  const baseURL = cfg.get<string>("localBaseURL")?.trim() || DEFAULT_LOCAL_BASE_URL
  const proxy = cfg.get<string>("localProxy")?.trim() ?? ""
  const picked = cfg.get<string>("localTemplate") ?? "auto"
  const id: FimTemplateID = resolveFimProfile(picked, model || DEFAULT_LOCAL_MODEL)
  const endpoint = cfg.get<string>("localEndpoint")
  const resolved: LocalFimEndpoint =
    endpoint && validLocalFimEndpoint(endpoint) ? (endpoint as LocalFimEndpoint) : (profiles[id].endpoint ?? "generate")
  return {
    baseURL,
    endpoint: resolved,
    proxy,
    stop: profiles[id].stop,
    wrap: (prefix, suffix) => renderFim(id, prefix, suffix).prompt,
  }
}
