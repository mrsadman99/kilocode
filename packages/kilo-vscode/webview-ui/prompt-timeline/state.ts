import { createSignal } from "solid-js"
import type { Run } from "../../src/prompt-timeline/runs"

export interface SessionItem {
  id: string
  title?: string
  updatedAt?: string
}

export type TimelineMessage =
  | { type: "promptTimeline.init"; sessionID: string; directory?: string }
  | { type: "promptTimeline.runs"; sessionID: string; runs: Run[] }
  | { type: "promptTimeline.sessions"; sessions: SessionItem[] }
  | { type: "promptTimeline.loading"; sessionID: string; loading: boolean }
  | { type: "promptTimeline.error"; sessionID: string; message: string }

export function createTimeline() {
  const [sessions, setSessions] = createSignal<SessionItem[]>([])
  const [runs, setRuns] = createSignal<Run[]>([])
  const [current, setCurrent] = createSignal("")
  const [selected, setSelected] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const run = () => runs().find((item) => item.id === selected())
  const position = () => {
    const item = run()
    return item ? runs().indexOf(item) : -1
  }

  const open = (id: string) => setSelected(id)
  const back = () => setSelected(null)
  const step = (dir: -1 | 1) => {
    const next = runs().at(position() + dir)
    if (next) setSelected(next.id)
  }

  const switchSession = (id: string) => {
    if (id === current()) return
    setCurrent(id)
    setSelected(null)
    setRuns([])
    setError(null)
    setLoading(true)
  }

  const onMessage = (message: TimelineMessage) => {
    if (message.type === "promptTimeline.init") {
      setCurrent(message.sessionID)
      setSelected(null)
      setError(null)
      setLoading(true)
      return
    }
    if (message.type === "promptTimeline.sessions") {
      setSessions(message.sessions)
      return
    }
    if (message.sessionID !== current()) return
    if (message.type === "promptTimeline.runs") {
      setRuns(message.runs)
      setLoading(false)
      setError(null)
      if (selected() && !message.runs.some((item) => item.id === selected())) setSelected(null)
      return
    }
    if (message.type === "promptTimeline.loading") {
      setLoading(message.loading)
      return
    }
    if (message.type === "promptTimeline.error") {
      setError(message.message)
      setLoading(false)
    }
  }

  return {
    sessions,
    runs,
    current,
    selected,
    run,
    position,
    loading,
    error,
    open,
    back,
    step,
    switchSession,
    onMessage,
  }
}
