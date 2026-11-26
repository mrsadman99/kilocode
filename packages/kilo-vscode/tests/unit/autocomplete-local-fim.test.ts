import { describe, it, expect, afterEach, beforeEach } from "bun:test"
import * as vscode from "vscode"
import { localFimOptions } from "../../src/services/autocomplete/local-fim"

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

describe("localFimOptions", () => {
  let state: Map<string, unknown>

  beforeEach(() => {
    state = new Map()
    stubConfig(state)
  })

  it("defaults to an empty proxy (direct connection)", () => {
    expect(localFimOptions("qwen2.5-coder:7b").proxy).toBe("")
  })

  it("reads and trims the configured local proxy", () => {
    state.set("localProxy", "  http://127.0.0.1:8080  ")
    expect(localFimOptions("qwen2.5-coder:7b").proxy).toBe("http://127.0.0.1:8080")
  })

  it("treats a whitespace-only proxy as unset", () => {
    state.set("localProxy", "   ")
    expect(localFimOptions("qwen2.5-coder:7b").proxy).toBe("")
  })
})
