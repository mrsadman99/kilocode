import { describe, expect, test } from "bun:test"
import { loopback } from "@/kilocode/server/loopback"

describe("loopback", () => {
  test("matches localhost, the full 127/8 range, and IPv6 loopback", () => {
    for (const host of ["localhost", "127.0.0.1", "127.0.0.2", "127.0.1.1", "127.255.255.254", "[::1]"]) {
      expect(loopback(`http://${host}:11434/v1/completions`)).toBe(true)
    }
  })

  test("rejects non-loopback hosts", () => {
    for (const host of ["10.0.0.1", "192.168.1.10", "example.com", "127.example.com", "0.0.0.0"]) {
      expect(loopback(`http://${host}:11434/v1/completions`)).toBe(false)
    }
  })
})
