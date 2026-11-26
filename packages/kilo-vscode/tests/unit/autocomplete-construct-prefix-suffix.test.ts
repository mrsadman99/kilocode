import { describe, expect, it } from "bun:test"
import { constructInitialPrefixSuffix } from "../../src/services/autocomplete/continuedev/core/autocomplete/templating/constructPrefixSuffix"
import type { AutocompleteInput } from "../../src/services/autocomplete/continuedev/core/autocomplete/util/types"
import type { IDE } from "../../src/services/autocomplete/continuedev/core"

function input(patch: Partial<AutocompleteInput>): AutocompleteInput {
  return {
    isUntitledFile: false,
    completionId: "c",
    filepath: "file:///repo/a.py",
    languageId: "python",
    pos: { line: 0, character: 0 },
    recentlyVisitedRanges: [],
    recentlyEditedRanges: [],
    ...patch,
  }
}

function ide(content: string) {
  const state = { reads: 0 }
  const fake = {
    readFile: async () => {
      state.reads++
      return content
    },
  } as unknown as IDE
  return { fake, state }
}

describe("constructInitialPrefixSuffix", () => {
  it("uses manually passed prefix/suffix without reading the file", async () => {
    const { fake, state } = ide("should not be read")
    const result = await constructInitialPrefixSuffix(
      input({ manuallyPassPrefix: "before", manuallyPassSuffix: "after", pos: { line: 0, character: 6 } }),
      fake,
    )
    expect(result).toEqual({ prefix: "before", suffix: "after" })
    expect(state.reads).toBe(0)
  })

  it("applies injectDetails to a manually passed prefix", async () => {
    const { fake, state } = ide("")
    const result = await constructInitialPrefixSuffix(
      input({ manuallyPassPrefix: "code", manuallyPassSuffix: "", injectDetails: "note" }),
      fake,
    )
    expect(result.prefix).toBe("\n# note\ncode")
    expect(state.reads).toBe(0)
  })

  it("prefers manuallyPassFileContents over manual prefix/suffix (notebook path)", async () => {
    const { fake, state } = ide("")
    const result = await constructInitialPrefixSuffix(
      input({
        manuallyPassFileContents: "xx\nyy",
        manuallyPassPrefix: "ignored",
        manuallyPassSuffix: "ignored",
        pos: { line: 1, character: 1 },
      }),
      fake,
    )
    expect(result).toEqual({ prefix: "xx\ny", suffix: "y" })
    expect(state.reads).toBe(0)
  })

  it("reads the file when nothing is passed manually", async () => {
    const { fake, state } = ide("hello\nworld")
    const result = await constructInitialPrefixSuffix(input({ pos: { line: 0, character: 2 } }), fake)
    expect(result).toEqual({ prefix: "he", suffix: "llo\nworld" })
    expect(state.reads).toBe(1)
  })

  it("falls back to contents when selectedCompletionInfo is present", async () => {
    const { fake } = ide("")
    const result = await constructInitialPrefixSuffix(
      input({
        manuallyPassFileContents: "abcd",
        manuallyPassPrefix: "ignored",
        manuallyPassSuffix: "ignored",
        pos: { line: 0, character: 3 },
        selectedCompletionInfo: {
          text: "X",
          range: { start: { line: 0, character: 2 }, end: { line: 0, character: 2 } },
        },
      }),
      fake,
    )
    expect(result.prefix).toBe("abX")
    expect(result.suffix).toBe("d")
  })
})
