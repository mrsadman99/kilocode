// kilocode_change - new file
// Structured output (json_schema format) is captured via a required StructuredOutput
// tool call. When the model finishes with plain text instead of calling the tool,
// retry a bounded number of times with an explicit reminder rather than failing the
// turn immediately. The reminder is injected as an ephemeral user message, matching
// the provider-safe pattern used for the max-steps prompt.

export const RETRIES = 2

export const REMINDER =
  "You did not call the StructuredOutput tool. You MUST call the StructuredOutput tool now with your final answer formatted according to the requested schema. Do not respond with plain text."

export function shouldRetry(input: {
  format?: { type: string; retryCount?: number }
  structured: unknown
  attempt: number
}) {
  if (input.format?.type !== "json_schema") return false
  if (input.structured !== undefined) return false
  return input.attempt < (input.format.retryCount ?? RETRIES)
}

export * as KiloStructuredOutput from "./structured-output"