import { describe, expect, it } from "bun:test"
import { handleSuggestionAccept, type SuggestionContext } from "../../src/kilo-provider/handlers/suggestion"
import { validateReviewModel } from "../../src/provider-actions"
import type { KiloClient } from "@kilocode/sdk/v2/client"

function setup(overrides: Partial<SuggestionContext> = {}) {
  const accepted: Array<Record<string, unknown>> = []
  const persisted: Array<{ providerID: string; modelID: string }> = []
  const posted: Array<unknown> = []
  const client = {
    suggestion: {
      accept: async (params: Record<string, unknown>) => {
        accepted.push(params)
        return { data: true }
      },
    },
  } as unknown as KiloClient
  const base: SuggestionContext = {
    client,
    currentSessionId: "ses_current",
    trackedSessionIds: new Set(),
    sessionDirectories: new Map(),
    postMessage: (msg) => posted.push(msg),
    getWorkspaceDirectory: () => "/workspace",
    persistReviewModel: async (model) => {
      persisted.push(model)
    },
  }
  return { ctx: { ...base, ...overrides }, accepted, persisted, posted }
}

describe("suggestion review model", () => {
  it("forwards the selected model to the CLI and remembers it", async () => {
    const { ctx, accepted, persisted } = setup()
    await handleSuggestionAccept(ctx, "sug_1", 0, "ses_1", { providerID: "anthropic", modelID: "claude" })
    expect(accepted).toHaveLength(1)
    expect(accepted[0]).toMatchObject({
      requestID: "sug_1",
      index: 0,
      model: { providerID: "anthropic", modelID: "claude" },
    })
    expect(persisted).toEqual([{ providerID: "anthropic", modelID: "claude" }])
  })

  it("does not send or remember a model when none is selected", async () => {
    const { ctx, accepted, persisted } = setup()
    await handleSuggestionAccept(ctx, "sug_1", 0)
    expect(accepted[0]).not.toHaveProperty("model")
    expect(persisted).toEqual([])
  })

  it("ignores an incomplete model selection", async () => {
    const { ctx, accepted, persisted } = setup()
    await handleSuggestionAccept(ctx, "sug_1", 0, undefined, { providerID: "anthropic" })
    expect(accepted[0]).not.toHaveProperty("model")
    expect(persisted).toEqual([])
  })

  it("posts an error and does not remember when accept fails", async () => {
    const client = {
      suggestion: {
        accept: async () => {
          throw new Error("boom")
        },
      },
    } as unknown as KiloClient
    const { ctx, persisted, posted } = setup({ client })
    await handleSuggestionAccept(ctx, "sug_1", 0, undefined, { providerID: "anthropic", modelID: "claude" })
    expect(persisted).toEqual([])
    expect(posted).toContainEqual({ type: "suggestionError", requestID: "sug_1" })
  })

  it("validateReviewModel accepts only complete selections", () => {
    expect(validateReviewModel({ providerID: "a", modelID: "b" })).toEqual({ providerID: "a", modelID: "b" })
    expect(validateReviewModel({ providerID: "a" })).toBeNull()
    expect(validateReviewModel(null)).toBeNull()
    expect(validateReviewModel("a/b")).toBeNull()
  })
})
