import { describe, expect, test } from "bun:test"
import { KiloSessionProcessor } from "@/kilocode/session/processor"

describe("kilocode.session.processor.doomHint", () => {
  test("take returns the marked tool once and clears it", () => {
    KiloSessionProcessor.doomHint.mark("ses_a", "bash")
    expect(KiloSessionProcessor.doomHint.take("ses_a")).toBe("bash")
    expect(KiloSessionProcessor.doomHint.take("ses_a")).toBeUndefined()
  })

  test("take returns undefined when nothing was marked", () => {
    expect(KiloSessionProcessor.doomHint.take("ses_missing")).toBeUndefined()
  })

  test("clear drops a pending hint", () => {
    KiloSessionProcessor.doomHint.mark("ses_b", "read")
    KiloSessionProcessor.doomHint.clear("ses_b")
    expect(KiloSessionProcessor.doomHint.take("ses_b")).toBeUndefined()
  })

  test("mark overwrites the previous tool for the same session", () => {
    KiloSessionProcessor.doomHint.mark("ses_c", "read")
    KiloSessionProcessor.doomHint.mark("ses_c", "edit")
    expect(KiloSessionProcessor.doomHint.take("ses_c")).toBe("edit")
  })

  test("hints are isolated per session", () => {
    KiloSessionProcessor.doomHint.mark("ses_d", "bash")
    KiloSessionProcessor.doomHint.mark("ses_e", "grep")
    expect(KiloSessionProcessor.doomHint.take("ses_d")).toBe("bash")
    expect(KiloSessionProcessor.doomHint.take("ses_e")).toBe("grep")
  })

  test("reminder names the repeated tool and urges a different approach", () => {
    const text = KiloSessionProcessor.DOOM_LOOP_REMINDER("bash")
    expect(text).toContain("bash")
    expect(text).toContain("same arguments")
    expect(text).toContain("Change your approach")
  })
})