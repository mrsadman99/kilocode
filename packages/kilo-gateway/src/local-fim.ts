import type { FimTarget } from "./fim.js"

type LocalTarget = Extract<FimTarget, { provider: "local" }>

export interface LocalFimPayload {
  prefix: string
  maxTokens?: number
  temperature?: number
  stop?: readonly string[]
}

export function localFimBody(target: LocalTarget, payload: LocalFimPayload) {
  const prompt = payload.prefix
  const max = payload.maxTokens ?? 256
  const temperature = payload.temperature ?? 0.2
  const stop = payload.stop ?? []
  if (target.endpoint === "generate") {
    return {
      model: target.model,
      prompt,
      raw: true,
      stream: true,
      options: { temperature, num_predict: max, stop },
    }
  }
  return { model: target.model, prompt, max_tokens: max, temperature, stream: true, stop }
}

function event(line: string) {
  if (!line.trim()) return undefined
  const chunk = JSON.parse(line) as {
    response?: string
    error?: string
    done?: boolean
    prompt_eval_count?: number
    eval_count?: number
  }
  // Ollama reports runtime failures (e.g. model not found) as an error record
  // inside an already-open stream. Surface it as a failure instead of caching
  // an empty completion as a success.
  if (chunk.error) throw new Error(`FIM local error: ${chunk.error}`)
  const out: { choices: { text: string }[]; usage?: { prompt_tokens: number; completion_tokens: number } } = {
    choices: [{ text: chunk.response ?? "" }],
  }
  if (chunk.done) {
    out.usage = { prompt_tokens: chunk.prompt_eval_count ?? 0, completion_tokens: chunk.eval_count ?? 0 }
  }
  return `data: ${JSON.stringify(out)}\n\n`
}

/** Normalize Ollama's NDJSON /api/generate stream into OpenAI-style SSE chunks. */
export async function* ollamaSse(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      const evt = event(line)
      if (evt) yield evt
    }
  }
  const tail = event(buf)
  if (tail) yield tail
}

export async function requestLocalFim(
  target: LocalTarget,
  payload: LocalFimPayload,
  signal: AbortSignal,
  send: (url: string, init: RequestInit) => Promise<Response> = fetch,
) {
  const response = await send(target.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(localFimBody(target, payload)),
  })
  if (!response.ok || !response.body || target.endpoint !== "generate") return response
  const encoder = new TextEncoder()
  const source = ollamaSse(response.body)
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const chunk of source) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, {
    status: response.status,
    headers: { "Content-Type": "text/event-stream" },
  })
}
