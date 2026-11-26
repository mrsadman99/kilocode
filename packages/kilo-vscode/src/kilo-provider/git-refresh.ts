type Refresh = (parts: unknown[], sessionID?: string) => void

/**
 * Coalesces part-driven git status refreshes per session: trailing debounce
 * with a hard cap so continuous edit streaming still refreshes periodically.
 */
export function createGitRefresh(refresh: Refresh, delay = 400, max = 2000) {
  const lanes = new Map<string, { parts: unknown[]; timer: ReturnType<typeof setTimeout>; first: number }>()

  const fire = (key: string) => {
    const lane = lanes.get(key)
    if (!lane) return
    lanes.delete(key)
    refresh(lane.parts, key === "" ? undefined : key)
  }

  return {
    push(parts: unknown[], sessionID?: string) {
      if (parts.length === 0) return
      const key = sessionID ?? ""
      const now = Date.now()
      const lane = lanes.get(key)
      if (!lane) {
        const timer = setTimeout(() => fire(key), delay)
        lanes.set(key, { parts: [...parts], timer, first: now })
        return
      }
      lane.parts.push(...parts)
      clearTimeout(lane.timer)
      const wait = Math.min(delay, Math.max(0, max - (now - lane.first)))
      lane.timer = setTimeout(() => fire(key), wait)
    },
    dispose() {
      for (const lane of lanes.values()) clearTimeout(lane.timer)
      lanes.clear()
    },
  }
}
