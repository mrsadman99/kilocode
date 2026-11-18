import * as vscode from "vscode"
import {
  DEFAULT_LOCAL_BASE_URL,
  validFimTemplate,
  validLocalFimEndpoint,
  type FimTemplateID,
  type LocalFimEndpoint,
} from "../../shared/autocomplete-models"
import { fimTemplates, inferFimTemplate } from "./continuedev/core/autocomplete/templating/AutocompleteTemplate"

export interface LocalFimOptions {
  baseURL: string
  endpoint: LocalFimEndpoint
  stop: string[]
  wrap: (prefix: string, suffix: string) => string
}

/** Resolve local FIM settings: template (auto = infer from model name), endpoint (auto = template default). */
export function localFimOptions(model: string): LocalFimOptions {
  const cfg = vscode.workspace.getConfiguration("kilo-code.new.autocomplete")
  const baseURL = cfg.get<string>("localBaseURL")?.trim() || DEFAULT_LOCAL_BASE_URL
  const picked = cfg.get<string>("localTemplate")
  const id: FimTemplateID = picked && validFimTemplate(picked) ? (picked as FimTemplateID) : inferFimTemplate(model)
  const template = fimTemplates[id]
  const endpoint = cfg.get<string>("localEndpoint")
  const resolved: LocalFimEndpoint =
    endpoint && validLocalFimEndpoint(endpoint) ? (endpoint as LocalFimEndpoint) : (template.endpoint ?? "generate")
  return {
    baseURL,
    endpoint: resolved,
    stop: template.completionOptions?.stop ?? [],
    wrap: (prefix, suffix) => template.template(prefix, suffix),
  }
}
