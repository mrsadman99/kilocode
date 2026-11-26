import { afterEach, describe, expect, it } from "bun:test"
import * as vscode from "vscode"
import { VsCodeIde } from "../../src/services/autocomplete/continuedev/core/vscode-test-harness/src/VSCodeIde"

const workspace = vscode.workspace as any
const uriApi = vscode.Uri as any

const original = {
  documents: workspace.textDocuments,
  parse: uriApi.parse,
  stat: workspace.fs.stat,
  readFile: workspace.fs.readFile,
}

afterEach(() => {
  workspace.textDocuments = original.documents
  uriApi.parse = original.parse
  workspace.fs.stat = original.stat
  workspace.fs.readFile = original.readFile
})

function openDoc(uri: string, lines: string[], version = 1) {
  const state = { reads: 0, version }
  const doc = {
    uri: { toString: () => uri },
    get version() {
      return state.version
    },
    lineCount: lines.length,
    lineAt: (i: number) => ({ text: lines[i] ?? "" }),
    getText: () => {
      state.reads++
      return lines.join("\n")
    },
  }
  return { doc, state }
}

function useParse() {
  uriApi.parse = (value: string) => ({ scheme: "file", path: value, fsPath: value, toString: () => value })
}

describe("VsCodeIde.readFile cache", () => {
  it("caches open document content by version", async () => {
    useParse()
    const { doc, state } = openDoc("file:///repo/cache-a.ts", ["content"])
    workspace.textDocuments = [doc]
    const ide = new VsCodeIde({} as any)
    expect(await ide.readFile("file:///repo/cache-a.ts")).toBe("content")
    expect(await ide.readFile("file:///repo/cache-a.ts")).toBe("content")
    expect(state.reads).toBe(1)
    state.version = 2
    expect(await ide.readFile("file:///repo/cache-a.ts")).toBe("content")
    expect(state.reads).toBe(2)
  })

  it("caches disk content by mtime and size", async () => {
    useParse()
    workspace.textDocuments = []
    const statState = { mtime: 100, calls: 0 }
    workspace.fs.stat = async () => ({ type: 1, ctime: 0, mtime: statState.mtime, size: 3 })
    workspace.fs.readFile = async () => {
      statState.calls++
      return new Uint8Array([97, 98, 99])
    }
    const ide = new VsCodeIde({} as any)
    expect(await ide.readFile("file:///repo/cache-b.ts")).toBe("abc")
    expect(await ide.readFile("file:///repo/cache-b.ts")).toBe("abc")
    expect(statState.calls).toBe(1)
    statState.mtime = 200
    expect(await ide.readFile("file:///repo/cache-b.ts")).toBe("abc")
    expect(statState.calls).toBe(2)
  })
})

describe("VsCodeIde.readRangeInFile", () => {
  it("reads inclusive line ranges from open documents without a full copy", async () => {
    useParse()
    const { doc, state } = openDoc("file:///repo/range-a.ts", ["alpha", "beta", "gamma"])
    workspace.textDocuments = [doc]
    const ide = new VsCodeIde({} as any)
    const result = await ide.readRangeInFile("file:///repo/range-a.ts", {
      start: { line: 0, character: 0 },
      end: { line: 2, character: Number.MAX_SAFE_INTEGER },
    })
    expect(result).toBe("alpha\nbeta\ngamma")
    expect(state.reads).toBe(0)
  })

  it("preserves the partial-line and single-line semantics", async () => {
    useParse()
    const { doc } = openDoc("file:///repo/range-b.ts", ["alpha", "beta", "gamma"])
    workspace.textDocuments = [doc]
    const ide = new VsCodeIde({} as any)
    expect(
      await ide.readRangeInFile("file:///repo/range-b.ts", {
        start: { line: 0, character: 0 },
        end: { line: 1, character: 2 },
      }),
    ).toBe("alpha\nbe")
    expect(
      await ide.readRangeInFile("file:///repo/range-b.ts", {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 2 },
      }),
    ).toBe("\nbe")
  })

  it("clamps out-of-bounds end lines", async () => {
    useParse()
    const { doc } = openDoc("file:///repo/range-c.ts", ["alpha", "beta"])
    workspace.textDocuments = [doc]
    const ide = new VsCodeIde({} as any)
    expect(
      await ide.readRangeInFile("file:///repo/range-c.ts", {
        start: { line: 0, character: 0 },
        end: { line: 99, character: Number.MAX_SAFE_INTEGER },
      }),
    ).toBe("alpha\nbeta")
  })
})
