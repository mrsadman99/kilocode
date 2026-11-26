import { describe, expect, it } from "bun:test"
import {
  countTokens,
  pruneLinesFromTop,
  pruneLinesFromBottom,
} from "../../src/services/autocomplete/continuedev/core/llm/countTokens"

const MODEL = "codestral"

function budget(lines: string[]): number {
  return lines.reduce((sum, line) => sum + countTokens(line, MODEL), 0) + Math.max(0, lines.length - 1)
}

describe("pruneLinesFromTop", () => {
  it("keeps the whole prompt when it fits the budget", () => {
    const prompt = "alpha\nbeta\ngamma"
    expect(pruneLinesFromTop(prompt, 10_000, MODEL)).toBe(prompt)
  })

  it("keeps exactly the tail that fits, including newline tokens", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `const value${i} = ${i}`)
    const tail = lines.slice(-3)
    expect(pruneLinesFromTop(lines.join("\n"), budget(tail), MODEL)).toBe(tail.join("\n"))
    expect(pruneLinesFromTop(lines.join("\n"), budget(tail) - 1, MODEL)).toBe(lines.slice(-2).join("\n"))
  })

  it("returns empty when even the last line does not fit", () => {
    expect(pruneLinesFromTop("a single very long line that cannot fit", 0, MODEL)).toBe("")
  })

  it("handles empty prompts and non-positive budgets", () => {
    expect(pruneLinesFromTop("", 10, MODEL)).toBe("")
    expect(pruneLinesFromTop("abc", -5, MODEL)).toBe("")
  })

  it("produces a maximal suffix within budget", () => {
    const lines = Array.from({ length: 25 }, (_, i) => `function f${i}() { return ${i} }`)
    const prompt = lines.join("\n")
    const max = 30
    const kept = pruneLinesFromTop(prompt, max, MODEL)
    const keptLines = kept.split("\n")
    expect(budget(keptLines)).toBeLessThanOrEqual(max)
    const index = lines.length - keptLines.length
    if (index > 0) {
      expect(budget(lines.slice(index - 1))).toBeGreaterThan(max)
    }
  })
})

describe("pruneLinesFromBottom", () => {
  it("keeps the whole prompt when it fits the budget", () => {
    const prompt = "alpha\nbeta\ngamma"
    expect(pruneLinesFromBottom(prompt, 10_000, MODEL)).toBe(prompt)
  })

  it("keeps exactly the head that fits, including newline tokens", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `const value${i} = ${i}`)
    const head = lines.slice(0, 3)
    expect(pruneLinesFromBottom(lines.join("\n"), budget(head), MODEL)).toBe(head.join("\n"))
    expect(pruneLinesFromBottom(lines.join("\n"), budget(head) - 1, MODEL)).toBe(lines.slice(0, 2).join("\n"))
  })

  it("returns empty when even the first line does not fit", () => {
    expect(pruneLinesFromBottom("a single very long line that cannot fit", 0, MODEL)).toBe("")
  })

  it("produces a maximal prefix within budget", () => {
    const lines = Array.from({ length: 25 }, (_, i) => `function f${i}() { return ${i} }`)
    const prompt = lines.join("\n")
    const max = 30
    const kept = pruneLinesFromBottom(prompt, max, MODEL)
    const keptLines = kept.split("\n")
    expect(budget(keptLines)).toBeLessThanOrEqual(max)
    if (keptLines.length < lines.length) {
      expect(budget(lines.slice(0, keptLines.length + 1))).toBeGreaterThan(max)
    }
  })
})

describe("line token cache", () => {
  it("is stable across repeated prunes and model families", () => {
    const prompt = Array.from({ length: 30 }, (_, i) => `let item${i} = "text${i}"`).join("\n")
    for (const model of [MODEL, "llama2"]) {
      const first = pruneLinesFromTop(prompt, 40, model)
      const second = pruneLinesFromTop(prompt, 40, model)
      expect(second).toBe(first)
      expect(budget(first.split("\n"))).toBeLessThanOrEqual(40)
    }
  })

  it("does not change countTokens results", () => {
    const line = "const answer = 42"
    const before = countTokens(line, MODEL)
    pruneLinesFromTop(`${line}\n${line}\n${line}`, 5, MODEL)
    expect(countTokens(line, MODEL)).toBe(before)
  })
})
