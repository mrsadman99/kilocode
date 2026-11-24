import { describe, it, expect, afterEach, beforeEach } from "bun:test"
import * as vscode from "vscode"
import { migrateLocalAutocompleteProvider } from "../../src/services/autocomplete/migrate-local"

type Update = { key: string; value: unknown; target: unknown }

type ConfigStub = {
  get: <T>(key: string) => T | undefined
  inspect: (key: string) => { globalValue?: string; workspaceValue?: string } | undefined
  update: (key: string, value: unknown, target: unknown) => Promise<void>
}

const original = vscode.workspace.getConfiguration

function stub(
  state: Map<string, unknown>,
  scope: { globalValue?: string; workspaceValue?: string },
  updates: Update[],
) {
  const config: ConfigStub = {
    get: <T>(key: string) => (state.has(key) ? (state.get(key) as T) : undefined),
    inspect: (key: string) => (key === "provider" ? scope : undefined),
    update: async (key, value, target) => {
      updates.push({ key, value, target })
      if (value === undefined) state.delete(key)
      else state.set(key, value)
    },
  }
  ;(vscode.workspace as unknown as { getConfiguration: () => ConfigStub }).getConfiguration = () => config
}

function context(flag: boolean) {
  const store = new Map<string, unknown>([["kilo.autocomplete.localToCustomMigrationV1", flag]])
  return {
    globalState: {
      get: <T>(key: string) => store.get(key) as T | undefined,
      update: async (key: string, value: unknown) => {
        store.set(key, value)
      },
    },
  } as unknown as vscode.ExtensionContext
}

afterEach(() => {
  ;(vscode.workspace as unknown as { getConfiguration: typeof original }).getConfiguration = original
})

describe("migrateLocalAutocompleteProvider", () => {
  let state: Map<string, unknown>
  let updates: Update[]

  beforeEach(() => {
    state = new Map()
    updates = []
  })

  it("migrates a global local provider into custom with the generate format", async () => {
    state.set("localModel", "qwen2.5-coder:7b")
    state.set("localBaseURL", "http://127.0.0.1:11434")
    state.set("localProxy", "http://127.0.0.1:5222")
    state.set("localTemplate", "qwen")
    stub(state, { globalValue: "local" }, updates)

    await migrateLocalAutocompleteProvider(context(false))

    const written = Object.fromEntries(updates.map((u) => [u.key, u.value]))
    expect(written.customModel).toBe("qwen2.5-coder:7b")
    expect(written.customBaseURL).toBe("http://127.0.0.1:11434")
    expect(written.customProxy).toBe("http://127.0.0.1:5222")
    expect(written.customTemplate).toBe("qwen")
    expect(written.customFormat).toBe("generate")
    expect(written.provider).toBe("custom")
    // Provider is written last so no intermediate state is invalid.
    expect(updates.at(-1)?.key).toBe("provider")
    expect(updates.every((u) => u.target === vscode.ConfigurationTarget.Global)).toBe(true)
  })

  it("maps the completions endpoint to the completions format", async () => {
    state.set("localEndpoint", "completions")
    stub(state, { globalValue: "local" }, updates)

    await migrateLocalAutocompleteProvider(context(false))

    expect(updates.find((u) => u.key === "customFormat")?.value).toBe("completions")
    expect(updates.find((u) => u.key === "customTemplate")?.value).toBe("auto")
  })

  it("migrates workspace-scoped local pins in the workspace scope", async () => {
    stub(state, { workspaceValue: "local" }, updates)

    await migrateLocalAutocompleteProvider(context(false))

    expect(updates.length).toBeGreaterThan(0)
    expect(updates.every((u) => u.target === vscode.ConfigurationTarget.Workspace)).toBe(true)
  })

  it("leaves non-local providers untouched", async () => {
    stub(state, { globalValue: "mistral" }, updates)

    await migrateLocalAutocompleteProvider(context(false))

    expect(updates).toEqual([])
  })

  it("runs only once per machine", async () => {
    stub(state, { globalValue: "local" }, updates)

    await migrateLocalAutocompleteProvider(context(true))

    expect(updates).toEqual([])
  })
})
