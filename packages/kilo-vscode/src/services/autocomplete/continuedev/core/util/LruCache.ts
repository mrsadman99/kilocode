export class PrecalculatedLruCache<V> {
  private items: [string, V][] = []
  private pending = new Map<string, Promise<void>>()
  constructor(
    private readonly calculateValue: (key: string) => Promise<V | null>,
    private readonly N: number,
  ) {}

  async initKey(key: string) {
    // Maintain LRU
    const index = this.items.findIndex((item) => item[0] === key)

    if (index >= 0) {
      // Move to end of array, since it was recently used
      const [item] = this.items.splice(index, 1)
      this.items.push(item)
      return
    }

    // Concurrent warms (tab-switch preload + request path) share one calculation.
    const existing = this.pending.get(key)
    if (existing) return existing

    const task = (async () => {
      const value: V | null = await this.calculateValue(key)

      if (value === null) {
        return
      }

      this.items.push([key, value])
      if (this.items.length > this.N) {
        this.items.shift()
      }
    })().finally(() => {
      this.pending.delete(key)
    })
    this.pending.set(key, task)
    return task
  }

  get(key: string): V | undefined {
    return this.items.find((item) => item[0] === key)?.[1]
  }
}
