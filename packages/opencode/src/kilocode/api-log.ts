// Outbound LLM / autocomplete API request log. Records model, thinking mode,
// proxy route, HTTP status and path, then publishes a `kilo.api` event on the
// global bus so connected clients (VS Code "kilo API" output channel) can show
// it. Enabled only when KILO_API_LOG is truthy — the VS Code extension sets it
// on the spawned server; other clients pay no overhead.

import { Schema } from "effect"
import { truthy } from "@opencode-ai/core/flag/flag"
import { BusEvent } from "@/bus/bus-event"
import { GlobalBus } from "@/bus/global"

export const Event = BusEvent.define(
  "kilo.api",
  Schema.Struct({
    kind: Schema.Literals(["llm", "autocomplete"]),
    provider: Schema.String,
    model: Schema.String,
    apiModel: Schema.optional(Schema.String),
    method: Schema.String,
    url: Schema.String,
    status: Schema.optional(Schema.Int),
    error: Schema.optional(Schema.String),
    detail: Schema.optional(Schema.String),
    thinking: Schema.optional(Schema.String),
    proxy: Schema.optional(Schema.String),
    ms: Schema.optional(Schema.Int),
  }).annotate({ identifier: "KiloApiRequest" }),
)

type Props = Schema.Schema.Type<typeof Event.properties>

export function enabled() {
  return truthy("KILO_API_LOG")
}

function emit(props: Props) {
  GlobalBus.emit("event", {
    directory: "global",
    payload: { type: Event.type, properties: props },
  })
}

function message(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

function parse(body: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(body)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    return undefined
  } catch {
    return undefined
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  return undefined
}

/**
 * Extract the thinking/reasoning mode and the wire model name from a provider
 * request body. Covers OpenAI (`reasoning_effort`, `reasoning.effort`),
 * Anthropic (`thinking`) and Gemini (`generationConfig.thinkingConfig`) shapes.
 * Bodies without reasoning markers skip the full JSON parse — prompt payloads
 * can be megabytes, and this runs on the server event loop per request.
 */
const REASONING = /"reasoning_effort"|"reasoning"|"thinking"|"generationConfig"/
const MODEL = /"model"\s*:\s*"([^"]+)"/

export function bodyFields(body: unknown): { thinking?: string; model?: string } {
  if (typeof body !== "string") return {}
  const model = MODEL.exec(body)?.[1]
  if (!REASONING.test(body)) return model ? { model } : {}
  const parsed = parse(body)
  if (!parsed) return model ? { model } : {}
  const wire = typeof parsed.model === "string" ? parsed.model : model
  const effort = parsed.reasoning_effort
  if (typeof effort === "string") return { thinking: effort, ...(wire ? { model: wire } : {}) }
  const reasoning = record(parsed.reasoning)
  if (reasoning && typeof reasoning.effort === "string")
    return { thinking: reasoning.effort, ...(wire ? { model: wire } : {}) }
  const thinking = record(parsed.thinking)
  if (thinking && typeof thinking.type === "string") {
    const budget = thinking.budget_tokens
    const mode = thinking.type === "enabled" && typeof budget === "number" ? `enabled(${budget})` : thinking.type
    return { thinking: mode, ...(wire ? { model: wire } : {}) }
  }
  const generation = record(parsed.generationConfig)
  const config = record(generation?.thinkingConfig)
  if (config && typeof config.thinkingBudget === "number")
    return { thinking: `budget(${config.thinkingBudget})`, ...(wire ? { model: wire } : {}) }
  return wire ? { model: wire } : {}
}

function clean(proxy: string) {
  const url = URL.parse(proxy)
  if (!url) return "custom"
  return `${url.protocol}//${url.host}`
}

function excluded(hostname: string, entry: string) {
  if (entry === "*") return true
  if (entry.startsWith(".")) return hostname.endsWith(entry)
  return hostname === entry || hostname.endsWith(`.${entry}`)
}

/**
 * Resolve the proxy a request actually travels through: the explicit
 * per-provider proxy, else the HTTP(S)_PROXY / ALL_PROXY environment variable
 * Bun's fetch applies (honoring NO_PROXY). `direct` marks transports that
 * bypass env proxies (loopback FIM). Credentials are stripped from the label.
 */
export function proxyLabel(proxy: string | undefined, url: string, direct = false): string | undefined {
  if (proxy) return clean(proxy)
  if (direct) return undefined
  const target = URL.parse(url)
  if (!target) return undefined
  const env =
    target.protocol === "https:"
      ? (process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.ALL_PROXY ?? process.env.all_proxy)
      : (process.env.HTTP_PROXY ?? process.env.http_proxy ?? process.env.ALL_PROXY ?? process.env.all_proxy)
  if (!env) return undefined
  const skip = process.env.NO_PROXY ?? process.env.no_proxy ?? ""
  const hostname = target.hostname.toLowerCase()
  if (skip.split(",").some((item) => excluded(hostname, item.trim().toLowerCase()))) return undefined
  return `env:${clean(env)}`
}

function urlOf(request: unknown) {
  const raw = request instanceof Request ? request.url : String(request)
  const url = URL.parse(raw)
  if (!url) return raw
  return `${url.origin}${url.pathname}`
}

function methodOf(request: unknown, init?: RequestInit) {
  return init?.method ?? (request instanceof Request ? request.method : "GET")
}

const READ_LIMIT = 2000
const SHOW_LIMIT = 400
const READ_TIMEOUT_MS = 3000

/**
 * Read a bounded prefix of an error response body without consuming the
 * original stream (the AI SDK / FIM handler still needs it). The clone is
 * cancelled once enough text is buffered or the read timeout fires.
 */
async function errorText(res: Response) {
  const reader = res.clone().body?.getReader()
  if (!reader) return ""
  const decoder = new TextDecoder()
  const timer = setTimeout(() => void reader.cancel().catch(() => undefined), READ_TIMEOUT_MS)
  let text = ""
  while (text.length < READ_LIMIT) {
    const part = await reader.read()
    if (part.done) break
    text += decoder.decode(part.value, { stream: true })
  }
  clearTimeout(timer)
  void reader.cancel().catch(() => undefined)
  return text
}

/**
 * Extract the human-readable message from a provider error body. Covers
 * OpenAI/Anthropic (`error.message`), bare `error` strings and `message`
 * fields; falls back to the raw text. Flattened and truncated for one line.
 */
export function detailOf(text: string): string | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const parsed = parse(trimmed)
  const err = record(parsed?.error)
  const msg = (() => {
    if (err && typeof err.message === "string" && err.message) return err.message
    if (typeof parsed?.error === "string" && parsed.error) return parsed.error
    if (typeof parsed?.message === "string" && parsed.message) return parsed.message
    return trimmed
  })()
  const flat = msg.replace(/\s+/g, " ").trim()
  if (!flat) return undefined
  return flat.length > SHOW_LIMIT ? `${flat.slice(0, SHOW_LIMIT)}…` : flat
}

/** Record one LLM provider request (success or failure) from the SDK fetch wrapper. */
export async function llm(input: {
  model: { providerID: string; id: string }
  request: unknown
  init?: RequestInit
  proxy?: string
  started: number
  response?: Response
  error?: unknown
}) {
  if (!enabled()) return
  const url = urlOf(input.request)
  const fields = bodyFields(input.init?.body)
  const proxy = proxyLabel(input.proxy, url)
  const base = {
    kind: "llm" as const,
    provider: input.model.providerID,
    model: input.model.id,
    ...(fields.model && fields.model !== input.model.id ? { apiModel: fields.model } : {}),
    method: methodOf(input.request, input.init),
    url,
    ...(fields.thinking ? { thinking: fields.thinking } : {}),
    ...(proxy ? { proxy } : {}),
    ms: Date.now() - input.started,
  }
  if (input.error !== undefined) {
    emit({ ...base, error: message(input.error) })
    return
  }
  const res = input.response
  if (!res || res.ok) {
    emit({ ...base, ...(res ? { status: res.status } : {}) })
    return
  }
  const detail = detailOf(await errorText(res).catch(() => ""))
  emit({ ...base, status: res.status, ...(detail ? { detail } : {}) })
}

/** Run an autocomplete (FIM) request and record its outcome. */
export async function trace<T extends Response>(
  meta: {
    provider: string
    model: string
    url: string
    method?: string
    proxy?: string
    direct?: boolean
  },
  fn: () => Promise<T>,
): Promise<T> {
  if (!enabled()) return fn()
  const started = Date.now()
  const url = urlOf(meta.url)
  const proxy = proxyLabel(meta.proxy, meta.url, meta.direct)
  const base = {
    kind: "autocomplete" as const,
    provider: meta.provider,
    model: meta.model,
    method: meta.method ?? "POST",
    url,
    ...(proxy ? { proxy } : {}),
  }
  try {
    const res = await fn()
    if (res.ok) {
      emit({ ...base, status: res.status, ms: Date.now() - started })
      return res
    }
    const detail = detailOf(await errorText(res).catch(() => ""))
    emit({ ...base, status: res.status, ...(detail ? { detail } : {}), ms: Date.now() - started })
    return res
  } catch (err) {
    emit({ ...base, error: message(err), ms: Date.now() - started })
    throw err
  }
}
