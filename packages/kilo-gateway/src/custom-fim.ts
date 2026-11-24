import type { FimTarget } from "./fim.js"

type CustomTarget = Extract<FimTarget, { provider: "custom" }>

export interface CustomFimPayload {
  prefix: string
  suffix: string
  maxTokens?: number
  temperature?: number
  stop?: readonly string[]
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

export async function requestCustomFim(
  target: CustomTarget,
  payload: CustomFimPayload,
  signal: AbortSignal,
  send: (url: string, init: RequestInit) => Promise<Response> = fetch,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream" }
  if (target.apiKey) headers.Authorization = `Bearer ${target.apiKey}`
  const response = await send(target.url, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify(customFimBody(target, payload)),
  })
  if (!response.ok || !response.body) return response
  // OpenAI-style SSE already emits `data: {choices:[{text}]}` chunks; pass through.
  return new Response(response.body, {
    status: response.status,
    headers: { "Content-Type": "text/event-stream" },
  })
}
