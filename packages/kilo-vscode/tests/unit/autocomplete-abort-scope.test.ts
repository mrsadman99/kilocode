import { describe, expect, it } from "bun:test"
import * as vscode from "vscode"
import { AutocompleteInlineCompletionProvider } from "../../src/services/autocomplete/classic-auto-complete/AutocompleteInlineCompletionProvider"
import { fireFileWatchers } from "../setup/vscode-mock"

function createProvider(state = "connected") {
  ;(vscode.window as any).onDidChangeActiveTextEditor = () => ({ dispose: () => {} })
  ;(vscode.window as any).onDidChangeTextEditorSelection = () => ({ dispose: () => {} })
  const provider = new AutocompleteInlineCompletionProvider(
    {} as any,
    "kilo/mistralai/codestral-2508",
    { getConnectionState: () => state } as any,
    () => {},
    () => ({ enableAutoTrigger: true }),
  )
  ;(provider as any).getPrompt = async () => ({ prompt: prompt(), prefix: "", suffix: "" })
  return provider
}

function doc() {
  return {
    languageId: "python",
    isUntitled: false,
    uri: { scheme: "file", fsPath: "/repo/file.py", toString: () => "file:///repo/file.py" },
  } as any
}

function prompt() {
  return {
    prefix: "",
    suffix: "",
    modelName: "codestral",
    completionOptions: {},
    selectedCompletionInfo: undefined,
  } as any
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("autocomplete FIM abort scope", () => {
  it("does not abort in-flight requests from another scope", async () => {
    const provider = createProvider()
    const signals: AbortSignal[] = []
    const resolvers: Array<() => void> = []
    ;(provider as any).fimPromptBuilder = {
      getFromFIM: async (
        _connection: unknown,
        _model: string,
        _prompt: unknown,
        process: (text: string) => unknown,
        signal: AbortSignal,
      ) => {
        signals.push(signal)
        return new Promise((resolve) => {
          resolvers.push(() => {
            resolve({
              suggestion: process("value"),
              cost: 0,
              inputTokens: 0,
              outputTokens: 0,
            })
          })
        })
      },
    }

    const first = provider.fetchAndCacheSuggestion("scope-a", doc(), {} as any)
    await tick()

    const second = provider.fetchAndCacheSuggestion("scope-b", doc(), {} as any)
    await tick()

    expect(signals[0]?.aborted).toBe(false)
    expect(signals[1]?.aborted).toBe(false)

    resolvers.forEach((resolve) => resolve())
    await Promise.all([first, second])
    provider.dispose()
  })

  it("aborts older in-flight requests in the same scope", async () => {
    const provider = createProvider()
    const signals: AbortSignal[] = []
    const resolvers: Array<() => void> = []
    ;(provider as any).fimPromptBuilder = {
      getFromFIM: async (
        _connection: unknown,
        _model: string,
        _prompt: unknown,
        process: (text: string) => unknown,
        signal: AbortSignal,
      ) => {
        signals.push(signal)
        return new Promise((resolve) => {
          resolvers.push(() => {
            resolve({
              suggestion: process("value"),
              cost: 0,
              inputTokens: 0,
              outputTokens: 0,
            })
          })
        })
      },
    }

    const first = provider.fetchAndCacheSuggestion("scope-a", doc(), {} as any)
    await tick()

    const second = provider.fetchAndCacheSuggestion("scope-a", doc(), {} as any)
    await tick()

    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)

    resolvers.forEach((resolve) => resolve())
    await Promise.all([first, second])
    provider.dispose()
  })

  it("does not retain controllers when credentials are invalid", async () => {
    const provider = createProvider("disconnected")
    ;(provider as any).fimPromptBuilder = {
      getFromFIM: () => {
        throw new Error("should not fetch")
      },
    }

    await provider.fetchAndCacheSuggestion("scope-a", doc(), {} as any)

    expect((provider as any).fimAbortControllers.size).toBe(0)
    provider.dispose()
  })

  it("discards cache, in-flight requests and backoff when the configuration changes", async () => {
    const provider = createProvider()
    const signals: AbortSignal[] = []
    let resolveFetch: (() => void) | undefined
    ;(provider as any).fimPromptBuilder = {
      getFromFIM: async (
        _connection: unknown,
        _model: string,
        _prompt: unknown,
        process: (text: string) => unknown,
        signal: AbortSignal,
      ) => {
        signals.push(signal)
        return new Promise((resolve) => {
          resolveFetch = () => resolve({ suggestion: process("value"), cost: 0, inputTokens: 0, outputTokens: 0 })
        })
      },
    }

    provider.updateSuggestions({ text: "old", prefix: "", suffix: "", scope: "scope-a" })
    provider.backoff.failure(new Error("SSE failed: 402 Payment Required"))
    expect(provider.backoff.blocked()).toBe(true)

    const inflight = provider.fetchAndCacheSuggestion("scope-a", doc(), {} as any)
    await tick()
    expect(signals.length).toBe(1)

    provider.setModel("local/qwen2.5-coder:7b", '["local","qwen2.5-coder:7b"]')

    expect(signals[0]?.aborted).toBe(true)
    expect(provider.suggestionsHistory.length).toBe(0)
    expect(provider.backoff.blocked()).toBe(false)

    resolveFetch?.()
    await inflight
    // The superseded request must not repopulate the cache with stale results.
    expect(provider.suggestionsHistory.length).toBe(0)
    provider.dispose()
  })

  it("keeps state when the configuration is unchanged", () => {
    const provider = createProvider()
    provider.updateSuggestions({ text: "keep", prefix: "", suffix: "", scope: "s" })

    provider.setModel("kilo/mistralai/codestral-2508")

    expect(provider.suggestionsHistory.length).toBe(1)
    provider.dispose()
  })

  it("does not send when the file is excluded before sending", async () => {
    const provider = createProvider()
    let sent = 0
    ;(provider as any).fimPromptBuilder = {
      getFromFIM: async () => {
        sent++
        return {
          suggestion: { text: "x", prefix: "", suffix: "", scope: "s" },
          cost: 0,
          inputTokens: 0,
          outputTokens: 0,
        }
      },
    }
    ;(provider as any).excluded = async () => true

    await provider.fetchAndCacheSuggestion("scope-a", doc(), {} as any)

    expect(sent).toBe(0)
    provider.dispose()
  })

  it("does not cache a request aborted with the same configuration", async () => {
    const provider = createProvider()
    let resolveFetch: (() => void) | undefined
    ;(provider as any).fimPromptBuilder = {
      getFromFIM: async (_connection: unknown, _model: string, _prompt: unknown, process: (text: string) => unknown) =>
        new Promise((resolve) => {
          resolveFetch = () => resolve({ suggestion: process("partial"), cost: 0, inputTokens: 0, outputTokens: 0 })
        }),
    }

    const inflight = provider.fetchAndCacheSuggestion("scope-a", doc(), {} as any)
    await tick()
    ;(provider as any).fimAbortControllers.get("scope-a")?.abort()
    resolveFetch?.()
    await inflight

    expect(provider.suggestionsHistory.length).toBe(0)
    provider.dispose()
  })

  it("cancels in-flight requests and clears cache when ignore rules change", async () => {
    const provider = createProvider()
    const signals: AbortSignal[] = []
    let resolveFetch: (() => void) | undefined
    ;(provider as any).fimPromptBuilder = {
      getFromFIM: async (
        _connection: unknown,
        _model: string,
        _prompt: unknown,
        process: (text: string) => unknown,
        signal: AbortSignal,
      ) => {
        signals.push(signal)
        return new Promise((resolve) => {
          resolveFetch = () => resolve({ suggestion: process("value"), cost: 0, inputTokens: 0, outputTokens: 0 })
        })
      },
    }

    provider.updateSuggestions({ text: "cached", prefix: "", suffix: "", scope: "scope-a" })
    const inflight = provider.fetchAndCacheSuggestion("scope-a", doc(), {} as any)
    await tick()
    expect(signals.length).toBe(1)

    fireFileWatchers()

    expect(signals[0]?.aborted).toBe(true)
    expect(provider.suggestionsHistory.length).toBe(0)
    resolveFetch?.()
    await inflight
    expect(provider.suggestionsHistory.length).toBe(0)
    provider.dispose()
  })
})
