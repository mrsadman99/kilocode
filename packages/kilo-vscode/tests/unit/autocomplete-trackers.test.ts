import { afterEach, describe, expect, it } from "bun:test"
import * as vscode from "vscode"
import { RecentlyEditedTracker } from "../../src/services/autocomplete/continuedev/core/vscode-test-harness/src/autocomplete/recentlyEdited"
import { RecentlyVisitedRangesService } from "../../src/services/autocomplete/continuedev/core/vscode-test-harness/src/autocomplete/RecentlyVisitedRangesService"
import type { IDE } from "../../src/services/autocomplete/continuedev/core"

const workspace = vscode.workspace as any
const window = vscode.window as any

const original = {
  edit: workspace.onDidChangeTextDocument,
  selection: window.onDidChangeTextEditorSelection,
}

afterEach(() => {
  workspace.onDidChangeTextDocument = original.edit
  window.onDidChangeTextEditorSelection = original.selection
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function editListener() {
  const state = { subscribes: 0, disposes: 0, handler: undefined as ((event: any) => void) | undefined }
  workspace.onDidChangeTextDocument = (handler: (event: any) => void) => {
    state.subscribes++
    state.handler = handler
    return {
      dispose: () => {
        state.disposes++
      },
    }
  }
  return state
}

function selectionListener() {
  const state = { subscribes: 0, disposes: 0, handler: undefined as ((event: any) => void) | undefined }
  window.onDidChangeTextEditorSelection = (handler: (event: any) => void) => {
    state.subscribes++
    state.handler = handler
    return {
      dispose: () => {
        state.disposes++
      },
    }
  }
  return state
}

function rangeIde() {
  const calls: Array<{ uri: string; range: any }> = []
  const ide = {
    readRangeInFile: async (uri: string, range: any) => {
      calls.push({ uri, range })
      return "l1\nl2"
    },
    readFile: async () => {
      throw new Error("full readFile must not be used by trackers")
    },
  } as unknown as IDE
  return { ide, calls }
}

const uri = { toString: () => "file:///repo/x.ts", scheme: "file" }

describe("RecentlyEditedTracker", () => {
  it("does not subscribe until enabled", () => {
    const listener = editListener()
    const { ide } = rangeIde()
    const tracker = new RecentlyEditedTracker(ide)
    expect(listener.subscribes).toBe(0)
    tracker.setEnabled(true)
    expect(listener.subscribes).toBe(1)
    tracker.setEnabled(true)
    expect(listener.subscribes).toBe(1)
    tracker.dispose()
    expect(listener.disposes).toBe(1)
  })

  it("reads only the edited range, not the whole file", async () => {
    const listener = editListener()
    const { ide, calls } = rangeIde()
    const tracker = new RecentlyEditedTracker(ide)
    tracker.setEnabled(true)
    listener.handler!({
      document: { uri },
      contentChanges: [{ range: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } } }],
    })
    await tick()
    expect(calls.length).toBe(1)
    expect(calls[0]!.range.start).toEqual({ line: 2, character: 0 })
    expect(calls[0]!.range.end.line).toBe(3)
    const ranges = await tracker.getRecentlyEditedRanges()
    expect(ranges.length).toBe(1)
    expect(ranges[0]!.lines).toEqual(["l1", "l2"])
    tracker.dispose()
  })

  it("stops listening when disabled", () => {
    const listener = editListener()
    const { ide } = rangeIde()
    const tracker = new RecentlyEditedTracker(ide)
    tracker.setEnabled(true)
    tracker.setEnabled(false)
    expect(listener.disposes).toBe(1)
    tracker.dispose()
  })
})

describe("RecentlyVisitedRangesService", () => {
  const selection = (line: number) => ({
    textEditor: { document: { fileName: "/repo/x.ts", uri, lineCount: 100 } },
    selections: [{ active: { line } }],
  })

  it("does not subscribe until enabled", () => {
    const listener = selectionListener()
    const { ide } = rangeIde()
    const service = new RecentlyVisitedRangesService(ide)
    expect(listener.subscribes).toBe(0)
    service.setEnabled(true)
    expect(listener.subscribes).toBe(1)
    service.dispose()
    expect(listener.disposes).toBe(1)
  })

  it("debounces rapid selections into one bounded range read", async () => {
    const listener = selectionListener()
    const { ide, calls } = rangeIde()
    const service = new RecentlyVisitedRangesService(ide)
    service.setEnabled(true)
    listener.handler!(selection(10))
    listener.handler!(selection(20))
    listener.handler!(selection(50))
    await sleep(320)
    expect(calls.length).toBe(1)
    expect(calls[0]!.range.start).toEqual({ line: 30, character: 0 })
    expect(calls[0]!.range.end.line).toBe(70)
    const snippets = service.getSnippets()
    expect(snippets.length).toBe(1)
    expect(snippets[0]!.content).toBe("l1\nl2")
    service.dispose()
  })

  it("captures again after the debounce window closes", async () => {
    const listener = selectionListener()
    const { ide, calls } = rangeIde()
    const service = new RecentlyVisitedRangesService(ide)
    service.setEnabled(true)
    listener.handler!(selection(10))
    await sleep(320)
    listener.handler!(selection(60))
    await sleep(320)
    expect(calls.length).toBe(2)
    expect(calls[1]!.range.start.line).toBe(40)
    service.dispose()
  })
})
