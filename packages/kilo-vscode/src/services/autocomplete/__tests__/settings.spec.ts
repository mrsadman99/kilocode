import { beforeEach, describe, expect, it, vi } from "vitest"

const state = new Map<string, unknown>()
const update = vi.fn((key: string, value: unknown) => {
  state.set(key, value)
})

vi.mock("vscode", () => ({
  ConfigurationTarget: {
    Global: 1,
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, fallback: unknown) => state.get(key) ?? fallback),
      update,
    })),
    onDidChangeConfiguration: vi.fn(),
  },
}))

describe("autocomplete settings", () => {
  beforeEach(() => {
    state.clear()
    update.mockClear()
  })

  it("includes the configured direct provider model in loaded settings", async () => {
    state.set("provider", "mistral")
    state.set("model", "codestral-2508")
    const { buildAutocompleteSettingsMessage } = await import("../settings")

    expect(buildAutocompleteSettingsMessage().settings.provider).toBe("mistral")
    expect(buildAutocompleteSettingsMessage().settings.model).toBe("codestral-2508")
  })

  it("passes a bare model setting through unchanged so the webview can render it as-is", async () => {
    // The webview now distinguishes "no explicit setting" (null) from "user
    // picked something." We don't try to interpret a bare `model` here —
    // resolving it to a default happens at the runtime layer, not in the
    // settings message.
    state.set("model", "codestral-2508")
    const { buildAutocompleteSettingsMessage } = await import("../settings")

    expect(buildAutocompleteSettingsMessage().settings.provider).toBeNull()
    expect(buildAutocompleteSettingsMessage().settings.model).toBe("codestral-2508")
  })

  it("returns null for both keys when nothing is set (let the webview render 'Not set')", async () => {
    const { buildAutocompleteSettingsMessage } = await import("../settings")

    expect(buildAutocompleteSettingsMessage().settings.provider).toBeNull()
    expect(buildAutocompleteSettingsMessage().settings.model).toBeNull()
  })

  it("preserves an unsupported stored model verbatim — runtime fallback handles resolution", async () => {
    state.set("model", "some/removed-model")
    const { buildAutocompleteSettingsMessage } = await import("../settings")

    expect(buildAutocompleteSettingsMessage().settings.provider).toBeNull()
    expect(buildAutocompleteSettingsMessage().settings.model).toBe("some/removed-model")
  })

  it("validates supported model updates", async () => {
    const { validAutocompleteSetting } = await import("../settings")

    expect(validAutocompleteSetting("model", "codestral-2508")).toBe(true)
    expect(validAutocompleteSetting("provider", "mistral")).toBe(true)
  })

  it("accepts null/undefined for provider and model so users can clear the setting", async () => {
    const { validAutocompleteSetting } = await import("../settings")

    expect(validAutocompleteSetting("provider", null)).toBe(true)
    expect(validAutocompleteSetting("provider", undefined)).toBe(true)
    expect(validAutocompleteSetting("model", null)).toBe(true)
    expect(validAutocompleteSetting("model", undefined)).toBe(true)
  })

  it("rejects unsupported autocomplete updates", async () => {
    const { validAutocompleteSetting } = await import("../settings")

    expect(validAutocompleteSetting("model", "other/model")).toBe(false)
    expect(validAutocompleteSetting("provider", "openrouter")).toBe(false)
  })

  it("rejects non-boolean toggle updates", async () => {
    const { validAutocompleteSetting } = await import("../settings")

    expect(validAutocompleteSetting("enableAutoTrigger", "true")).toBe(false)
  })

  it("includes local provider settings in loaded settings", async () => {
    state.set("provider", "local")
    state.set("localModel", "starcoder2:7b")
    state.set("localBaseURL", "http://127.0.0.1:11434")
    state.set("localTemplate", "starcoder")
    state.set("localEndpoint", "completions")
    const { buildAutocompleteSettingsMessage } = await import("../settings")

    const settings = buildAutocompleteSettingsMessage().settings
    expect(settings.provider).toBe("local")
    expect(settings.localModel).toBe("starcoder2:7b")
    expect(settings.localBaseURL).toBe("http://127.0.0.1:11434")
    expect(settings.localTemplate).toBe("starcoder")
    expect(settings.localEndpoint).toBe("completions")
  })

  it("returns null for unset local settings", async () => {
    const { buildAutocompleteSettingsMessage } = await import("../settings")

    const settings = buildAutocompleteSettingsMessage().settings
    expect(settings.localModel).toBeNull()
    expect(settings.localBaseURL).toBeNull()
    expect(settings.localTemplate).toBeNull()
    expect(settings.localEndpoint).toBeNull()
  })

  it("accepts the local provider and its settings", async () => {
    const { validAutocompleteSetting } = await import("../settings")

    expect(validAutocompleteSetting("provider", "local")).toBe(true)
    expect(validAutocompleteSetting("localModel", "qwen2.5-coder:7b")).toBe(true)
    expect(validAutocompleteSetting("localModel", null)).toBe(true)
    expect(validAutocompleteSetting("localBaseURL", "http://127.0.0.1:11434")).toBe(true)
    expect(validAutocompleteSetting("localTemplate", "auto")).toBe(true)
    expect(validAutocompleteSetting("localTemplate", "qwen")).toBe(true)
    expect(validAutocompleteSetting("localEndpoint", "auto")).toBe(true)
    expect(validAutocompleteSetting("localEndpoint", "generate")).toBe(true)
  })

  it("rejects invalid local setting values", async () => {
    const { validAutocompleteSetting } = await import("../settings")

    expect(validAutocompleteSetting("localModel", 42)).toBe(false)
    expect(validAutocompleteSetting("localBaseURL", false)).toBe(false)
    expect(validAutocompleteSetting("localTemplate", "codestral")).toBe(false)
    expect(validAutocompleteSetting("localEndpoint", "chat")).toBe(false)
  })
})
