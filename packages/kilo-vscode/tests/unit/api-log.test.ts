import { test, expect, describe } from "bun:test"
import { format, entryOf } from "../../src/services/api-log"
import type { KiloApiRequest } from "@kilocode/sdk/v2/client"
import type { SSEPayload } from "../../src/services/cli-backend/sdk-sse-adapter"

const llm: KiloApiRequest = {
  kind: "llm",
  provider: "kilo",
  model: "claude-sonnet-4-5",
  method: "POST",
  url: "https://api.anthropic.com/v1/messages",
  status: 200,
  thinking: "enabled(8000)",
  ms: 1234,
}

const fim: KiloApiRequest = {
  kind: "autocomplete",
  provider: "mistral",
  model: "codestral-2508",
  method: "POST",
  url: "https://codestral.mistral.ai/v1/fim/completions",
  status: 200,
  proxy: "env:http://proxy.corp:3128",
  ms: 321,
}

const at = new Date(2026, 10, 19, 22, 31, 5, 123)

describe("api-log format", () => {
  test("LLM line carries tag, model, thinking, status, path and timing", () => {
    expect(format(llm, at)).toBe(
      "22:31:05.123 [LLM] POST https://api.anthropic.com/v1/messages → 200 (1234ms) model=kilo/claude-sonnet-4-5 thinking=enabled(8000) proxy=direct",
    )
  })

  test("autocomplete line is tagged separately and shows the env proxy", () => {
    expect(format(fim, at)).toBe(
      "22:31:05.123 [AUTOCOMPLETE] POST https://codestral.mistral.ai/v1/fim/completions → 200 (321ms) model=mistral/codestral-2508 proxy=env:http://proxy.corp:3128",
    )
  })

  test("explicit proxy and wire model alias", () => {
    const line = format({ ...llm, apiModel: "claude-sonnet-4-5-20250929", proxy: "http://127.0.0.1:8080" }, at)
    expect(line).toContain("api=claude-sonnet-4-5-20250929")
    expect(line).toContain("proxy=http://127.0.0.1:8080")
  })

  test("error line replaces status and flattens the message", () => {
    const line = format({ ...llm, status: undefined, error: "connection\nrefused" }, at)
    expect(line).toContain("→ ERR connection refused")
    expect(line).not.toContain("200")
  })

  test("provider error message is shown as detail with quotes escaped", () => {
    const line = format({ ...llm, status: 429, detail: 'Rate "limit" exceeded' }, at)
    expect(line).toContain("→ 429 (1234ms) detail=\"Rate 'limit' exceeded\"")
  })

  test("missing status and timing degrade gracefully", () => {
    const line = format(
      {
        kind: "llm",
        provider: "local",
        model: "qwen2.5-coder:7b",
        method: "POST",
        url: "http://127.0.0.1:11434/api/generate",
      },
      at,
    )
    expect(line).toBe(
      "22:31:05.123 [LLM] POST http://127.0.0.1:11434/api/generate → — model=local/qwen2.5-coder:7b proxy=direct",
    )
  })
})

describe("api-log entryOf", () => {
  test("extracts kilo.api properties", () => {
    const event: SSEPayload = { id: "evt_1", type: "kilo.api", properties: llm }
    expect(entryOf(event)).toEqual(llm)
  })

  test("ignores other events", () => {
    expect(entryOf({ id: "evt_2", type: "server.connected", properties: {} })).toBeUndefined()
    expect(
      entryOf({ type: "sync", name: "session.updated", id: "evt_3", seq: 1, aggregateID: "ses_1", data: {} }),
    ).toBeUndefined()
  })
})
