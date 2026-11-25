import { ResponseMetaData } from "./types"
import type { KiloConnectionService } from "../cli-backend"
import type { AutocompleteModelDef } from "@kilocode/kilo-gateway/autocomplete"
import { getAutocompleteModelById } from "../../shared/autocomplete-models"
import { localFimOptions } from "./local-fim"
import { customFimOptions, customPrompt } from "./custom-fim"

const FIM_MAX_TOKENS = 256

/** Assemble the provider-specific FIM request fields (prompt wrapping, endpoint options). */
function fimPrompt(info: AutocompleteModelDef, prefix: string, suffix: string, filename?: string) {
  if (info.providerID === "local") {
    const local = localFimOptions(info.modelID)
    return {
      prefix: local.wrap(prefix, suffix),
      suffix: "",
      baseURL: local.baseURL,
      endpoint: local.endpoint,
      stop: local.stop,
      proxy: local.proxy || undefined,
    }
  }
  if (info.providerID === "custom") {
    return customPrompt(customFimOptions(), info.modelID, prefix, suffix, filename)
  }
  return { prefix, suffix }
}

/**
 * Generate a FIM (Fill-in-the-Middle) completion via the CLI backend.
 * Uses the SDK's kilo.fim() SSE endpoint which handles auth and streaming.
 *
 * For local models the FIM prompt is assembled here from the model-specific
 * template and sent as a raw prompt; the backend proxies it to the local
 * server's /v1/completions or /api/generate endpoint.
 *
 * @param signal - Optional AbortSignal to cancel the SSE stream early (e.g. when the user types again)
 */
export async function generateFim(
  connectionService: Pick<KiloConnectionService, "getClientAsync">,
  modelId: string,
  prefix: string,
  suffix: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  filename?: string,
): Promise<ResponseMetaData> {
  const info = getAutocompleteModelById(modelId)
  if (!info) throw new Error(`Unknown autocomplete model: ${modelId}`)
  const prompt = fimPrompt(info, prefix, suffix, filename)
  const client = await connectionService.getClientAsync()
  let cost = 0
  let inputTokens = 0
  let outputTokens = 0

  // Capture SSE-level errors so they propagate to the caller. The SDK's SSE
  // client catches HTTP errors (402, 401, 429, 5xx) internally and silently
  // ends the stream. Without this, errors never reach ErrorBackoff.
  let sseError: Error | undefined

  console.info(`[FIM] request provider=${info.providerID} model=${info.requestModel} url=/kilo/fim`)

  const { stream } = await client.kilo.fim(
    {
      ...prompt,
      provider: info.providerID,
      model: info.modelID,
      maxTokens: FIM_MAX_TOKENS,
      temperature: info.temperature,
    },
    {
      signal,
      sseMaxRetryAttempts: 1,
      onSseError: (error) => {
        sseError = error instanceof Error ? error : new Error(String(error))
      },
    },
  )

  for await (const chunk of stream) {
    const choice = chunk.choices?.[0]
    const content = choice?.delta?.content ?? choice?.text
    if (content) onChunk(content)
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens ?? 0
      outputTokens = chunk.usage.completion_tokens ?? 0
    }
    if (chunk.cost !== undefined) cost = chunk.cost
  }

  if (sseError) throw sseError

  return {
    cost,
    inputTokens,
    outputTokens,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
  }
}

/**
 * Check if the CLI backend is connected. The CLI manages credentials internally,
 * so a connected state means we can issue FIM requests.
 */
export function hasValidCredentials(connectionService: KiloConnectionService): boolean {
  return connectionService.getConnectionState() === "connected"
}
