import { describe, expect, test } from "bun:test"
import { createGitRefresh } from "../../src/kilo-provider/git-refresh"

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

type Call = { parts: unknown[]; sessionID?: string }

function recorder() {
  const calls: Call[] = []
  const refresh = (parts: unknown[], sessionID?: string) => {
    calls.push({ parts, sessionID })
  }
  return { calls, refresh }
}

describe("createGitRefresh", () => {
  test("coalesces a burst into one refresh carrying all parts", async () => {
    const { calls, refresh } = recorder()
    const queue = createGitRefresh(refresh, 30, 200)

    queue.push(["a"], "ses")
    queue.push(["b"], "ses")
    queue.push(["c"], "ses")
    expect(calls).toHaveLength(0)

    await sleep(70)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.parts).toEqual(["a", "b", "c"])
    expect(calls[0]!.sessionID).toBe("ses")
    queue.dispose()
  })

  test("keeps sessions in separate lanes", async () => {
    const { calls, refresh } = recorder()
    const queue = createGitRefresh(refresh, 30, 200)

    queue.push(["a"], "one")
    queue.push(["b"], "two")
    await sleep(70)

    expect(calls).toHaveLength(2)
    const one = calls.find((call) => call.sessionID === "one")
    const two = calls.find((call) => call.sessionID === "two")
    expect(one?.parts).toEqual(["a"])
    expect(two?.parts).toEqual(["b"])
    queue.dispose()
  })

  test("workspace lane stays separate from session lanes", async () => {
    const { calls, refresh } = recorder()
    const queue = createGitRefresh(refresh, 30, 200)

    queue.push(["a"])
    queue.push(["b"], "ses")
    await sleep(70)

    expect(calls).toHaveLength(2)
    const workspace = calls.find((call) => call.sessionID === undefined)
    expect(workspace?.parts).toEqual(["a"])
    queue.dispose()
  })

  test("continuous pushes still refresh within the max wait", async () => {
    const { calls, refresh } = recorder()
    const queue = createGitRefresh(refresh, 40, 100)

    const start = Date.now()
    while (Date.now() - start < 160) {
      queue.push(["x"], "ses")
      await sleep(10)
    }
    expect(calls.length).toBeGreaterThanOrEqual(1)
    queue.dispose()
  })

  test("refreshes again after a quiet window without old parts", async () => {
    const { calls, refresh } = recorder()
    const queue = createGitRefresh(refresh, 30, 200)

    queue.push(["a"], "ses")
    await sleep(70)
    queue.push(["b"], "ses")
    await sleep(70)

    expect(calls).toHaveLength(2)
    expect(calls[0]!.parts).toEqual(["a"])
    expect(calls[1]!.parts).toEqual(["b"])
    queue.dispose()
  })

  test("dispose cancels pending refreshes", async () => {
    const { calls, refresh } = recorder()
    const queue = createGitRefresh(refresh, 30, 200)

    queue.push(["a"], "ses")
    queue.dispose()
    await sleep(70)
    expect(calls).toHaveLength(0)
  })

  test("ignores empty pushes", async () => {
    const { calls, refresh } = recorder()
    const queue = createGitRefresh(refresh, 30, 200)

    queue.push([], "ses")
    await sleep(70)
    expect(calls).toHaveLength(0)
    queue.dispose()
  })
})
