import { describe, expect, test } from "bun:test"
import { KiloToolRepair } from "@/kilocode/session/tool-repair"

const tools = { read: {}, edit: {}, bash: {}, execute: {}, read_file: {}, invalid: {} }

describe("kilocode.session.tool-repair", () => {
  test("repairs case-only mismatches", () => {
    expect(KiloToolRepair.repair("Read", tools)).toBe("read")
    expect(KiloToolRepair.repair("BASH", tools)).toBe("bash")
  })

  test("repairs separator and case variants via normalized match", () => {
    expect(KiloToolRepair.repair("ReadFile", tools)).toBe("read_file")
    expect(KiloToolRepair.repair("read-file", tools)).toBe("read_file")
    expect(KiloToolRepair.repair("READ_FILE", tools)).toBe("read_file")
  })

  test("repairs unambiguous near-miss names", () => {
    expect(KiloToolRepair.repair("raed", tools)).toBe("read")
    expect(KiloToolRepair.repair("execut", tools)).toBe("execute")
    expect(KiloToolRepair.repair("bashh", tools)).toBe("bash")
  })

  test("does not repair a name that already resolves", () => {
    expect(KiloToolRepair.repair("read", tools)).toBeUndefined()
    expect(KiloToolRepair.repair("read_file", tools)).toBeUndefined()
  })

  test("does not guess when two tools are equally close", () => {
    const ambiguous = { abc: {}, abd: {} }
    expect(KiloToolRepair.repair("abe", ambiguous)).toBeUndefined()
  })

  test("does not repair names that are too far from any tool", () => {
    expect(KiloToolRepair.repair("totally_different", tools)).toBeUndefined()
  })

  test("never repairs to the hidden invalid tool", () => {
    expect(KiloToolRepair.repair("invalidx", { invalid: {} })).toBeUndefined()
    expect(KiloToolRepair.repair("invalid", { invalid: {} })).toBeUndefined()
  })

  test("does not fuzzy-match very short names", () => {
    expect(KiloToolRepair.repair("re", { read: {} })).toBeUndefined()
  })

  test("returns undefined for empty or whitespace names", () => {
    expect(KiloToolRepair.repair("", tools)).toBeUndefined()
    expect(KiloToolRepair.repair("   ", tools)).toBeUndefined()
  })
})