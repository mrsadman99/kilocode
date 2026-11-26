// kilocode_change - new file
// Repair a hallucinated tool name to a real registered tool. Models occasionally
// emit near-miss names ("raed", "ReadFile", "execut"); mapping them back avoids a
// failed call and a wasted turn. Only unambiguous repairs are returned — when two
// tools are equally close the original error is surfaced instead of guessing.

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function distance(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = Array.from({ length: b.length + 1 }, () => 0)
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

/**
 * Returns the repaired tool name, or undefined when no safe repair exists.
 * `tools` is the registered tool map; the hidden "invalid" tool is never a target.
 */
export function repair(name: string, tools: Record<string, unknown>): string | undefined {
  const trimmed = name.trim()
  // A name that already resolves needs no repair (e.g. an invalid-args failure).
  if (tools[trimmed]) return undefined
  const candidates = Object.keys(tools).filter((tool) => tool !== "invalid")

  const lower = trimmed.toLowerCase()
  if (lower !== trimmed && tools[lower]) return lower

  const target = norm(trimmed)
  if (!target) return undefined

  const exact = candidates.filter((tool) => norm(tool) === target)
  if (exact.length === 1) return exact[0]

  // Fuzzy match only for names long enough to be meaningful, and only when a single
  // candidate is strictly closest within a small edit distance.
  if (target.length < 3) return undefined
  let best: string | undefined
  let bestDist = Infinity
  let tie = false
  for (const tool of candidates) {
    const d = distance(target, norm(tool))
    if (d < bestDist) {
      bestDist = d
      best = tool
      tie = false
    } else if (d === bestDist) {
      tie = true
    }
  }
  if (best && !tie && bestDist > 0 && bestDist <= 2) return best
  return undefined
}

export * as KiloToolRepair from "./tool-repair"