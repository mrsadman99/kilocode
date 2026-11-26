import * as vscode from "vscode"
import { DEFAULT_LOCAL_MODEL, renderFim, resolveFimProfile } from "@kilocode/kilo-gateway/autocomplete"

/** Custom endpoint API format: native OpenAI FIM or client-templated server protocols. */
export type CustomFimFormat = "openai" | "completions" | "generate" | "chat"

export interface CustomFimOptions {
  baseURL: string
  apiKey: string
  proxy: string
  format: CustomFimFormat
  template: string
}

/** Resolve custom FIM settings; an empty apiKey means no Authorization header. */
export function customFimOptions(): CustomFimOptions {
  const cfg = vscode.workspace.getConfiguration("kilo-code.new.autocomplete")
  const format = cfg.get<string>("customFormat")
  return {
    baseURL: cfg.get<string>("customBaseURL")?.trim() ?? "",
    apiKey: cfg.get<string>("customApiKey")?.trim() ?? "",
    proxy: cfg.get<string>("customProxy")?.trim() ?? "",
    format: format === "completions" || format === "generate" || format === "chat" ? format : "openai",
    template: cfg.get<string>("customTemplate")?.trim() || "auto",
  }
}

/** The HTTP API decides the envelope; only the model profile decides how to encode the hole. */
export function customPrompt(opts: CustomFimOptions, model: string, prefix: string, suffix: string, filename?: string) {
  const chat = opts.format === "chat"
  if (opts.format === "openai" || chat || opts.apiKey) {
    if (!opts.baseURL) throw new Error("Custom autocomplete base URL is not configured")
  }
  if ((opts.format === "openai" || chat) && !model) throw new Error("Custom autocomplete model is not configured")
  const connection = {
    baseURL: opts.baseURL || undefined,
    apiKey: opts.apiKey || undefined,
    proxy: opts.proxy || undefined,
  }
  if (opts.format === "openai") return { ...connection, prefix, suffix }

  const id = resolveFimProfile(opts.template, model || DEFAULT_LOCAL_MODEL)
  const rendered = renderFim(id, prefix, suffix, chat, filename)
  return {
    ...connection,
    endpoint: opts.format,
    prefix: rendered.prompt,
    suffix: "",
    stop: rendered.stop,
    ...(chat && rendered.system ? { system: rendered.system } : {}),
  }
}
