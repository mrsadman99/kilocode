import { describe, expect, it } from "bun:test"
import * as vscode from "vscode"
import { extractContextWindow, windowOf, PREFIX_WINDOW, SUFFIX_WINDOW } from "../../src/services/autocomplete/types"
import { AutocompleteInlineCompletionProvider } from "../../src/services/autocomplete/classic-auto-complete/AutocompleteInlineCompletionProvider"

function doc(text: string): vscode.TextDocument {
  const lines = text.split("\n")
  const starts: number[] = []
  let acc = 0
  for (const line of lines) {
    starts.push(acc)
    acc += line.length + 1
  }
  const length = text.length
  const offsetAt = (pos: { line: number; character: number }) =>
    Math.min(length, (starts[pos.line] ?? length) + pos.character)
  const positionAt = (offset: number) => {
    const clamped = Math.max(0, Math.min(offset, length))
    let line = 0
    for (let i = 0; i < starts.length; i++) {
      if (starts[i]! <= clamped) line = i
      else break
    }
    return new vscode.Position(line, clamped - starts[line]!)
  }
  return {
    getText: (range?: { start: { line: number; character: number }; end: { line: number; character: number } }) => {
      if (!range) return text
      return text.slice(offsetAt(range.start), offsetAt(range.end))
    },
    offsetAt,
    positionAt,
    lineCount: lines.length,
  } as unknown as vscode.TextDocument
}

describe("extractContextWindow", () => {
  it("returns the full prefix/suffix for small documents", () => {
    const win = extractContextWindow(doc("hello world"), new vscode.Position(0, 5))
    expect(win.prefix).toBe("hello")
    expect(win.suffix).toBe(" world")
  })

  it("caps the prefix and suffix around the cursor in large documents", () => {
    const text = "a".repeat(50_000) + "CURSOR" + "b".repeat(50_000)
    const win = extractContextWindow(doc(text), new vscode.Position(0, 50_000))
    expect(win.prefix.length).toBe(PREFIX_WINDOW)
    expect(win.suffix.length).toBe(SUFFIX_WINDOW)
    expect(win.prefix.endsWith("a".repeat(100))).toBe(true)
    expect(win.suffix.startsWith("CURSOR")).toBe(true)
  })

  it("clamps at document boundaries", () => {
    const text = "x".repeat(100_000)
    const start = extractContextWindow(doc(text), new vscode.Position(0, 10))
    expect(start.prefix.length).toBe(10)
    expect(start.suffix.length).toBe(SUFFIX_WINDOW)
    const end = extractContextWindow(doc(text), new vscode.Position(0, 99_990))
    expect(end.prefix.length).toBe(PREFIX_WINDOW)
    expect(end.suffix.length).toBe(10)
  })
})

describe("windowOf", () => {
  it("keeps only the tail of the prefix and the head of the suffix", () => {
    const win = windowOf("p".repeat(100_000), "s".repeat(100_000))
    expect(win.prefix.length).toBe(PREFIX_WINDOW)
    expect(win.suffix.length).toBe(SUFFIX_WINDOW)
    expect(win.prefix).toBe("p".repeat(PREFIX_WINDOW))
    expect(win.suffix).toBe("s".repeat(SUFFIX_WINDOW))
  })

  it("passes short strings through unchanged", () => {
    const win = windowOf("abc", "def")
    expect(win.prefix).toBe("abc")
    expect(win.suffix).toBe("def")
  })
})

function createProvider() {
  ;(vscode.window as any).onDidChangeActiveTextEditor = () => ({ dispose: () => {} })
  ;(vscode.window as any).onDidChangeTextEditorSelection = () => ({ dispose: () => {} })
  return new AutocompleteInlineCompletionProvider(
    {} as any,
    "kilo/mistralai/codestral-2508",
    { getConnectionState: () => "connected" } as any,
    () => {},
    () => ({ enableAutoTrigger: true }),
  )
}

describe("suggestion history windows", () => {
  it("stores bounded windows instead of full document text", () => {
    const provider = createProvider()
    provider.updateSuggestions({
      text: "value",
      scope: "s",
      prefix: "p".repeat(200_000),
      suffix: "s".repeat(200_000),
    })
    const entry = provider.suggestionsHistory.at(0)!
    expect(entry.prefix.length).toBe(PREFIX_WINDOW)
    expect(entry.suffix.length).toBe(SUFFIX_WINDOW)
    expect(entry.text).toBe("value")
    provider.dispose()
  })

  it("still deduplicates identical suggestions after windowing", () => {
    const provider = createProvider()
    const suggestion = { text: "value", scope: "s", prefix: "p".repeat(100_000), suffix: "s".repeat(100_000) }
    provider.updateSuggestions(suggestion)
    provider.updateSuggestions(suggestion)
    expect(provider.suggestionsHistory.length).toBe(1)
    provider.dispose()
  })
})
