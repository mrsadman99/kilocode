import * as vscode from "vscode"

/** Custom endpoint API format: native OpenAI FIM or client-templated server protocols. */
export type CustomFimFormat = "openai" | "completions" | "generate"

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
    format: format === "completions" || format === "generate" ? format : "openai",
    template: cfg.get<string>("customTemplate")?.trim() || "auto",
  }
}
