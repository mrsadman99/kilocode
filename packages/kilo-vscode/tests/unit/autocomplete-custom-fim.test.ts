import { describe, it, expect, afterEach, beforeEach } from "bun:test"
import * as vscode from "vscode"
import { customFimOptions } from "../../src/services/autocomplete/custom-fim"

type Stub = {
  getConfiguration: (section?: string) => {
    get: <T>(key: string, fallback?: T) => T | undefined
  }
}

const original = vscode.workspace.getConfiguration

function stubConfig(state: Map<string, unknown>) {
  ;(vscode.workspace as unknown as Stub).getConfiguration = (section?: string) => {
    if (section !== "kilo-code.new.autocomplete") {
      return { get: <T>(_key: string, fallback?: T) => fallback }
    }
    return {
      get: <T>(key: string, fallback?: T) => (state.has(key) ? (state.get(key) as T) : fallback),
    }
  }
}

afterEach(() => {
  ;(vscode.workspace as unknown as Stub).getConfiguration = original as Stub["getConfiguration"]
})

describe("customFimOptions", () => {
  let state: Map<string, unknown>

  beforeEach(() => {
    state = new Map()
    stubConfig(state)
  })

  it("defaults to empty values (no base URL, no auth, no proxy) and OpenAI format", () => {
    expect(customFimOptions()).toEqual({ baseURL: "", apiKey: "", proxy: "", format: "openai", template: "auto" })
  })

  it("reads and trims the configured values", () => {
    state.set("customBaseURL", "  https://api.deepseek.com/beta/  ")
    state.set("customApiKey", "  sk-test  ")
    state.set("customProxy", "  http://127.0.0.1:5222  ")
    state.set("customFormat", "generate")
    state.set("customTemplate", "qwen")
    expect(customFimOptions()).toEqual({
      baseURL: "https://api.deepseek.com/beta/",
      apiKey: "sk-test",
      proxy: "http://127.0.0.1:5222",
      format: "generate",
      template: "qwen",
    })
  })

  it("treats whitespace-only values as unset", () => {
    state.set("customBaseURL", "   ")
    state.set("customApiKey", "   ")
    state.set("customProxy", "   ")
    state.set("customTemplate", "   ")
    expect(customFimOptions()).toEqual({ baseURL: "", apiKey: "", proxy: "", format: "openai", template: "auto" })
  })

  it("falls back to the OpenAI format for unknown values", () => {
    state.set("customFormat", "bogus")
    expect(customFimOptions().format).toBe("openai")
    state.set("customFormat", "completions")
    expect(customFimOptions().format).toBe("completions")
  })
})
