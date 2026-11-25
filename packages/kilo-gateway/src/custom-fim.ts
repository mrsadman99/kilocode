import type { FimTarget } from "./fim.js"

type CustomTarget = Extract<FimTarget, { provider: "custom" }>

export interface CustomFimPayload {
  prefix: string
  suffix: string
  maxTokens?: number
  temperature?: number
  stop?: readonly string[]
}

/** OpenAI chat-completions payload: `prefix` is the already-rendered user content. */
export interface CustomChatPayload {
  prefix: string
  system?: string
  maxTokens?: number
  temperature?: number
  stop?: readonly string[]
}

/** Omitted/empty key means no Authorization header. */
function authHeaders(target: { apiKey?: string }): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream" }
  if (target.apiKey) headers.Authorization = `Bearer ${target.apiKey}`
  return headers
}

/** OpenAI-compatible completions body with native FIM prompt+suffix (no client-side templating). */
export function customFimBody(target: CustomTarget, payload: CustomFimPayload) {
  const stop = payload.stop ?? []
  return {
    model: target.model,
    prompt: payload.prefix,
    suffix: payload.suffix,
    max_tokens: payload.maxTokens ?? 256,
    temperature: payload.temperature ?? 0.2,
    stream: true,
    ...(stop.length ? { stop } : {}),
  }
}

/** Chat-completions body; wraps the rendered user content in a single user message. */
export function customChatBody(target: CustomTarget, payload: CustomChatPayload) {
  const stop = payload.stop ?? []
  const messages = [
    ...(payload.system ? [{ role: "system", content: payload.system }] : []),
    { role: "user", content: payload.prefix },
  ]
  return {
    model: target.model,
    messages,
    max_tokens: payload.maxTokens ?? 256,
    temperature: payload.temperature ?? 0.2,
    stream: true,
    ...(stop.length ? { stop } : {}),
  }
}

function passThrough(response: Response) {
  return new Response(response.body, {
    status: response.status,
    headers: { "Content-Type": "text/event-stream" },
  })
}

export async function requestCustomFim(
  target: CustomTarget,
  payload: CustomFimPayload,
  signal: AbortSignal,
  send: (url: string, init: RequestInit) => Promise<Response> = fetch,
) {
  const response = await send(target.url, {
    method: "POST",
    headers: authHeaders(target),
    signal,
    body: JSON.stringify(customFimBody(target, payload)),
  })
  if (!response.ok || !response.body) return response
  // OpenAI-style SSE already emits `data: {choices:[{text}]}` chunks; pass through.
  return passThrough(response)
}

export async function requestCustomChat(
  target: CustomTarget,
  payload: CustomChatPayload,
  signal: AbortSignal,
  send: (url: string, init: RequestInit) => Promise<Response> = fetch,
) {
  const response = await send(target.url, {
    method: "POST",
    headers: authHeaders(target),
    signal,
    body: JSON.stringify(customChatBody(target, payload)),
  })
  if (!response.ok || !response.body) return response
  // OpenAI-style SSE already emits `data: {choices:[{delta:{content}}]}` chunks; pass through.
  return passThrough(response)
}
