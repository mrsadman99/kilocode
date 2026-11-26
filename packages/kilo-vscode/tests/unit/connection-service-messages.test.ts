import { describe, expect, test } from "bun:test"
import { KiloConnectionService } from "../../src/services/cli-backend/connection-service"

function makeService() {
  return new KiloConnectionService({} as ConstructorParameters<typeof KiloConnectionService>[0])
}

function forward(service: KiloConnectionService): Map<string, string> {
  return (service as unknown as { messageSessionIdsByMessageId: Map<string, string> }).messageSessionIdsByMessageId
}

function reverse(service: KiloConnectionService): Map<string, Set<string>> {
  return (service as unknown as { messageIdsBySessionId: Map<string, Set<string>> }).messageIdsBySessionId
}

describe("KiloConnectionService message session pruning", () => {
  test("prune removes only the deleted session's messages", () => {
    const service = makeService()
    service.recordMessageSessionId("msg_1", "ses_a")
    service.recordMessageSessionId("msg_2", "ses_a")
    service.recordMessageSessionId("msg_3", "ses_b")

    service.pruneSession("ses_a")

    expect([...forward(service).entries()]).toEqual([["msg_3", "ses_b"]])
    expect(reverse(service).has("ses_a")).toBe(false)
    expect([...reverse(service).get("ses_b")!]).toEqual(["msg_3"])
    service.dispose()
  })

  test("reassigning a message moves it between session indexes", () => {
    const service = makeService()
    service.recordMessageSessionId("msg_1", "ses_a")
    service.recordMessageSessionId("msg_1", "ses_b")

    expect(reverse(service).has("ses_a")).toBe(false)
    expect([...reverse(service).get("ses_b")!]).toEqual(["msg_1"])

    service.pruneSession("ses_a")
    expect(forward(service).get("msg_1")).toBe("ses_b")

    service.pruneSession("ses_b")
    expect(forward(service).size).toBe(0)
    expect(reverse(service).size).toBe(0)
    service.dispose()
  })

  test("repeated records stay idempotent", () => {
    const service = makeService()
    service.recordMessageSessionId("msg_1", "ses_a")
    service.recordMessageSessionId("msg_1", "ses_a")
    service.recordMessageSessionId("msg_1", "ses_a")

    expect(reverse(service).get("ses_a")!.size).toBe(1)
    service.pruneSession("ses_a")
    expect(forward(service).size).toBe(0)
    service.dispose()
  })

  test("pruning an unknown session leaves the maps untouched", () => {
    const service = makeService()
    service.recordMessageSessionId("msg_1", "ses_a")

    service.pruneSession("ses_missing")

    expect(forward(service).get("msg_1")).toBe("ses_a")
    expect(reverse(service).get("ses_a")!.size).toBe(1)
    service.dispose()
  })

  test("sync message updates record mappings that prune removes", () => {
    const service = makeService()
    const event = {
      type: "sync",
      name: "message.updated.1",
      id: "evt_1",
      seq: 1,
      aggregateID: "msg_1",
      data: { sessionID: "ses_a", info: { id: "msg_1" } },
    } as Parameters<KiloConnectionService["resolveEventSessionId"]>[0]

    expect(service.resolveEventSessionId(event)).toBe("ses_a")
    expect(forward(service).get("msg_1")).toBe("ses_a")

    service.pruneSession("ses_a")
    expect(forward(service).size).toBe(0)
    expect(reverse(service).size).toBe(0)
    service.dispose()
  })

  test("dispose clears both indexes", () => {
    const service = makeService()
    service.recordMessageSessionId("msg_1", "ses_a")
    service.recordMessageSessionId("msg_2", "ses_b")

    service.dispose()

    expect(forward(service).size).toBe(0)
    expect(reverse(service).size).toBe(0)
  })
})
