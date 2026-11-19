import { describe, it, expect, afterEach, beforeEach } from "bun:test"
import * as vscode from "vscode"
import { buildAutocompleteSettingsMessage, validAutocompleteSetting } from "../../src/services/autocomplete/settings"

type Stub = {
  getConfiguration: (section?: string) => {
    get: <T>(key: string, fallback?: T) => T | undefined
    update?: (key: string, value: unknown) => Promise<void>
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

describe("buildAutocompleteSettingsMessage", () => {
  let state: Map<string, unknown>

  beforeEach(() => {
    state = new Map()
    stubConfig(state)
  })

  it("returns null for both keys when nothing is set so the webview renders 'Not set'", () => {
    const msg = buildAutocompleteSettingsMessage()

    expect(msg.settings.provider).toBeNull()
    expect(msg.settings.model).toBeNull()
  })

  it("passes an explicit BYOK selection through verbatim", () => {
    state.set("provider", "mistral")
    state.set("model", "codestral-2508")

    const msg = buildAutocompleteSettingsMessage()

    expect(msg.settings.provider).toBe("mistral")
    expect(msg.settings.model).toBe("codestral-2508")
  })

  it("does not coerce a bare model setting to a default — let the webview see what was stored", () => {
    state.set("model", "codestral-2508")

    const msg = buildAutocompleteSettingsMessage()

    expect(msg.settings.provider).toBeNull()
    expect(msg.settings.model).toBe("codestral-2508")
  })

  it("passes the local proxy setting through and defaults to null", () => {
    expect(buildAutocompleteSettingsMessage().settings.localProxy).toBeNull()

    state.set("localProxy", "http://127.0.0.1:8080")
    expect(buildAutocompleteSettingsMessage().settings.localProxy).toBe("http://127.0.0.1:8080")
  })
})

describe("validAutocompleteSetting", () => {
  it("accepts null/undefined for provider and model so the user can clear back to the default", () => {
    expect(validAutocompleteSetting("provider", null)).toBe(true)
    expect(validAutocompleteSetting("provider", undefined)).toBe(true)
    expect(validAutocompleteSetting("model", null)).toBe(true)
    expect(validAutocompleteSetting("model", undefined)).toBe(true)
  })

  it("accepts known providers and models", () => {
    expect(validAutocompleteSetting("provider", "mistral")).toBe(true)
    expect(validAutocompleteSetting("model", "codestral-2508")).toBe(true)
  })

  it("rejects unknown providers and models", () => {
    expect(validAutocompleteSetting("provider", "openrouter")).toBe(false)
    expect(validAutocompleteSetting("model", "gpt-5")).toBe(false)
  })

  it("rejects non-boolean toggle updates", () => {
    expect(validAutocompleteSetting("enableAutoTrigger", "true")).toBe(false)
  })

  it("accepts string or cleared local proxy values and rejects other types", () => {
    expect(validAutocompleteSetting("localProxy", "http://127.0.0.1:8080")).toBe(true)
    expect(validAutocompleteSetting("localProxy", "socks5://127.0.0.1:1080")).toBe(true)
    expect(validAutocompleteSetting("localProxy", "")).toBe(true)
    expect(validAutocompleteSetting("localProxy", null)).toBe(true)
    expect(validAutocompleteSetting("localProxy", undefined)).toBe(true)
    expect(validAutocompleteSetting("localProxy", 8080)).toBe(false)
  })
})
