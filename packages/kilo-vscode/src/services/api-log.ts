import * as vscode from "vscode"
import type { KiloApiRequest } from "@kilocode/sdk/v2/client"
import type { KiloConnectionService } from "./cli-backend"
import type { SSEPayload } from "./cli-backend/sdk-sse-adapter"

/**
 * "kilo API" output channel: outbound LLM and autocomplete API requests
 * recorded by the CLI backend (kilo.api events). Tags keep the two kinds
 * apart; each line carries the model, thinking mode, proxy route, HTTP
 * status and request path.
 */
export function registerApiLog(connection: KiloConnectionService): vscode.Disposable {
  const channel = vscode.window.createOutputChannel("kilo API")
  const unsubscribe = connection.onEvent((event) => {
    const entry = entryOf(event)
    if (!entry) return
    channel.appendLine(format(entry))
  })
  return vscode.Disposable.from({ dispose: unsubscribe }, channel)
}

export function entryOf(event: SSEPayload): KiloApiRequest | undefined {
  if (event.type !== "kilo.api") return undefined
  return event.properties
}

export function format(entry: KiloApiRequest, now = new Date()): string {
  const tag = entry.kind === "llm" ? "[LLM]" : "[AUTOCOMPLETE]"
  const time = `${now.toTimeString().slice(0, 8)}.${String(now.getMilliseconds()).padStart(3, "0")}`
  const outcome = entry.error === undefined ? String(entry.status ?? "—") : `ERR ${entry.error.replace(/\s+/g, " ")}`
  const parts = [`${time} ${tag} ${entry.method} ${entry.url} → ${outcome}`]
  if (entry.ms !== undefined) parts.push(`(${entry.ms}ms)`)
  if (entry.detail) parts.push(`detail="${entry.detail.replace(/"/g, "'")}"`)
  parts.push(`model=${entry.provider}/${entry.model}`)
  if (entry.apiModel) parts.push(`api=${entry.apiModel}`)
  if (entry.thinking) parts.push(`thinking=${entry.thinking}`)
  parts.push(`proxy=${entry.proxy ?? "direct"}`)
  return parts.join(" ")
}
