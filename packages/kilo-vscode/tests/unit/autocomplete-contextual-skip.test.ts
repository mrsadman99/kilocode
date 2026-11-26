import { describe, expect, it } from "bun:test"
import { shouldSkipAutocomplete } from "../../src/services/autocomplete/classic-auto-complete/contextualSkip"

describe("shouldSkipAutocomplete", () => {
  it("skips at end of statement for c-family languages", () => {
    expect(shouldSkipAutocomplete("const x = 1;", "", "typescript")).toBe(true)
    expect(shouldSkipAutocomplete("const x = 1;", "\nnext()", "typescript")).toBe(true)
    expect(shouldSkipAutocomplete("call()", "", "javascript")).toBe(true)
    expect(shouldSkipAutocomplete("}", "", "go")).toBe(true)
  })

  it("skips at end of statement for python", () => {
    expect(shouldSkipAutocomplete("print('hi')", "", "python")).toBe(true)
    expect(shouldSkipAutocomplete("x = [1]", "", "python")).toBe(true)
  })

  it("skips mid-word typing", () => {
    expect(shouldSkipAutocomplete("foo", "", "typescript")).toBe(true)
    expect(shouldSkipAutocomplete("x =", "y", "typescript")).toBe(true)
  })

  it("does not skip short words or fresh lines", () => {
    expect(shouldSkipAutocomplete("fo", "", "typescript")).toBe(false)
    expect(shouldSkipAutocomplete("", "", "python")).toBe(false)
    expect(shouldSkipAutocomplete("  ", "", "typescript")).toBe(false)
    expect(shouldSkipAutocomplete("const x = 1", "", "typescript")).toBe(false)
  })

  it("does not skip when the cursor has trailing content on the line", () => {
    expect(shouldSkipAutocomplete("foo;", " bar", "typescript")).toBe(false)
  })

  it("only looks at the current line of a multi-line prefix", () => {
    expect(shouldSkipAutocomplete("a;\n  b", "", "typescript")).toBe(false)
    expect(shouldSkipAutocomplete("a;\n  b;", "", "typescript")).toBe(true)
    expect(shouldSkipAutocomplete("a;\n  b;", "\n", "typescript")).toBe(true)
  })
})
