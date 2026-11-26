import { describe, expect, test } from "bun:test"
import { PrecalculatedLruCache } from "../../src/services/autocomplete/continuedev/core/util/LruCache"

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

describe("PrecalculatedLruCache", () => {
  test("cold get returns undefined until initKey completes", async () => {
    let calls = 0
    const cache = new PrecalculatedLruCache<string>(async (key) => {
      calls++
      await sleep(5)
      return `value:${key}`
    }, 4)

    expect(cache.get("a")).toBeUndefined()
    await cache.initKey("a")
    expect(cache.get("a")).toBe("value:a")
    expect(calls).toBe(1)
  })

  test("cached keys are not recomputed", async () => {
    let calls = 0
    const cache = new PrecalculatedLruCache<number>(async () => {
      calls++
      return calls
    }, 4)

    await cache.initKey("a")
    await cache.initKey("a")
    expect(calls).toBe(1)
    expect(cache.get("a")).toBe(1)
  })

  test("concurrent warms of the same cold key share one calculation", async () => {
    let calls = 0
    const cache = new PrecalculatedLruCache<string>(async (key) => {
      calls++
      await sleep(10)
      return key
    }, 4)

    await Promise.all([cache.initKey("a"), cache.initKey("a"), cache.initKey("a")])
    expect(calls).toBe(1)
    expect(cache.get("a")).toBe("a")
  })

  test("concurrent warms of different keys all land in the cache", async () => {
    const cache = new PrecalculatedLruCache<string>(async (key) => {
      await sleep(5)
      return key
    }, 4)

    await Promise.all([cache.initKey("a"), cache.initKey("b")])
    expect(cache.get("a")).toBe("a")
    expect(cache.get("b")).toBe("b")
  })

  test("evicts the least recently used key beyond N", async () => {
    const cache = new PrecalculatedLruCache<string>(async (key) => key, 2)

    await cache.initKey("a")
    await cache.initKey("b")
    await cache.initKey("c")
    expect(cache.get("a")).toBeUndefined()
    expect(cache.get("b")).toBe("b")
    expect(cache.get("c")).toBe("c")
  })

  test("initKey refreshes recency so touched keys survive eviction", async () => {
    const cache = new PrecalculatedLruCache<string>(async (key) => key, 2)

    await cache.initKey("a")
    await cache.initKey("b")
    await cache.initKey("a")
    await cache.initKey("c")
    expect(cache.get("a")).toBe("a")
    expect(cache.get("b")).toBeUndefined()
    expect(cache.get("c")).toBe("c")
  })

  test("null results are not cached and are recalculated", async () => {
    let calls = 0
    const cache = new PrecalculatedLruCache<string>(async () => {
      calls++
      return null
    }, 4)

    await cache.initKey("a")
    expect(cache.get("a")).toBeUndefined()
    await cache.initKey("a")
    expect(calls).toBe(2)
  })

  test("a failed calculation releases the pending slot for a retry", async () => {
    let calls = 0
    const cache = new PrecalculatedLruCache<string>(async () => {
      calls++
      if (calls === 1) throw new Error("parse failed")
      return "ok"
    }, 4)

    await expect(cache.initKey("a")).rejects.toThrow("parse failed")
    await cache.initKey("a")
    expect(cache.get("a")).toBe("ok")
    expect(calls).toBe(2)
  })

  test("concurrent callers share a failing calculation and can retry afterwards", async () => {
    let calls = 0
    const cache = new PrecalculatedLruCache<string>(async () => {
      calls++
      await sleep(5)
      if (calls === 1) throw new Error("parse failed")
      return "ok"
    }, 4)

    const first = cache.initKey("a").catch((err: unknown) => err)
    const second = cache.initKey("a").catch((err: unknown) => err)
    const [a, b] = await Promise.all([first, second])
    expect(a).toBeInstanceOf(Error)
    expect(b).toBeInstanceOf(Error)
    expect((a as Error).message).toBe("parse failed")
    expect(calls).toBe(1)

    await cache.initKey("a")
    expect(cache.get("a")).toBe("ok")
  })
})
