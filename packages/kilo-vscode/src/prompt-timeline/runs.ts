/**
 * Prompt Timeline view model.
 *
 * Derives per-prompt execution stages from the raw SDK message history.
 * Pure and vscode-free so it can be unit-tested directly; the panel
 * provider ships the resulting runs to the webview as-is.
 */

import type {
  Message,
  Part,
  PatchPart,
  ReasoningPart,
  RetryPart,
  StepFinishPart,
  SubtaskPart,
  TextPart,
  ToolPart,
} from "@kilocode/sdk/v2/client"

export type StageStatus = "pending" | "running" | "completed" | "error"

export type StageKind =
  | "reasoning"
  | "tool"
  | "response"
  | "step"
  | "compaction"
  | "file"
  | "retry"
  | "subtask"
  | "agent"
  | "patch"

export interface Stage {
  id: string
  kind: StageKind
  /** Registry icon name resolved by the webview Icon component. */
  icon: string
  title: string
  subtitle?: string
  status: StageStatus
  /** Truncated output / text preview for the expandable detail block. */
  detail?: string
  /** Milliseconds; absent while a stage is still running or undated. */
  duration?: number
  tokens?: { input: number; output: number }
  cost?: number
}

export interface Run {
  /** Owning user message id. */
  id: string
  /** 1-based position within the session. */
  index: number
  text: string
  time: number
  agent?: string
  model?: string
  status: StageStatus
  stages: Stage[]
  tools: number
  duration?: number
  tokens: { input: number; output: number }
  cost: number
}

export interface MessageItem {
  info: Message
  parts: Part[]
}

const DETAIL_LIMIT = 2000
const PROMPT_LIMIT = 4000
const SUBTITLE_LIMIT = 160

function clip(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}…`
}

function basename(path: string): string {
  const norm = path.replaceAll("\\", "/")
  return norm.split("/").filter(Boolean).at(-1) ?? path
}

function toolIcon(tool: string): string {
  switch (tool) {
    case "read":
      return "glasses"
    case "list":
      return "bullet-list"
    case "glob":
    case "grep":
      return "magnifying-glass-menu"
    case "webfetch":
    case "websearch":
      return "window-cursor"
    case "codesearch":
      return "code"
    case "task":
      return "task"
    case "bash":
    case "background_process":
      return "console"
    case "edit":
    case "write":
    case "apply_patch":
      return "code-lines"
    case "todowrite":
    case "todoread":
      return "checklist"
    case "question":
      return "bubble-5"
    case "skill":
      return "brain"
    default:
      return "mcp"
  }
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined
}

function toolSubtitle(tool: string, input: Record<string, unknown>): string | undefined {
  const file = str(input.filePath) ?? str(input.path)
  if (file && (tool === "read" || tool === "edit" || tool === "write" || tool === "list")) {
    return clip(basename(file), SUBTITLE_LIMIT)
  }
  const raw =
    str(input.description) ??
    str(input.command) ??
    str(input.query) ??
    str(input.pattern) ??
    str(input.url) ??
    str(input.prompt)
  return raw ? clip(raw, SUBTITLE_LIMIT) : undefined
}

function span(time: { start: number; end?: number } | undefined): number | undefined {
  if (!time?.start || !time.end || time.end < time.start) return undefined
  return time.end - time.start
}

function reasoningStage(part: ReasoningPart): Stage | undefined {
  const text = part.text?.trim()
  if (!text) return undefined
  return {
    id: part.id,
    kind: "reasoning",
    icon: "brain",
    title: "Reasoning",
    subtitle: clip(text.split("\n")[0] ?? "", SUBTITLE_LIMIT),
    status: part.time?.end ? "completed" : "running",
    detail: clip(text, DETAIL_LIMIT),
    duration: span(part.time),
  }
}

function toolStage(part: ToolPart): Stage {
  const state = part.state
  const input = state.input
  const detail =
    state.status === "completed"
      ? state.output
      : state.status === "error"
        ? state.error
        : JSON.stringify(input, null, 2)
  const title = state.status === "completed" || state.status === "running" ? state.title : undefined
  return {
    id: part.id,
    kind: "tool",
    icon: toolIcon(part.tool),
    title: title || part.tool,
    subtitle: toolSubtitle(part.tool, input),
    status: state.status,
    detail: detail ? clip(detail, DETAIL_LIMIT) : undefined,
    duration: state.status === "pending" ? undefined : span(state.time),
  }
}

function textStage(part: TextPart): Stage | undefined {
  const text = part.text?.trim()
  if (!text || part.synthetic || part.ignored) return undefined
  return {
    id: part.id,
    kind: "response",
    icon: "bubble-5",
    title: "Response",
    subtitle: clip(text.split("\n")[0] ?? "", SUBTITLE_LIMIT),
    status: part.time?.end ? "completed" : "running",
    detail: clip(text, DETAIL_LIMIT),
    duration: span(part.time),
  }
}

function stepStage(part: StepFinishPart): Stage {
  return {
    id: part.id,
    kind: "step",
    icon: "layers",
    title: part.model ? `${part.model.providerID}/${part.model.modelID}` : "Model step",
    subtitle: part.reason,
    status: "completed",
    duration: part.time?.elapsed,
    tokens: { input: part.tokens?.input ?? 0, output: part.tokens?.output ?? 0 },
    cost: part.cost,
  }
}

function retryStage(part: RetryPart): Stage {
  return {
    id: part.id,
    kind: "retry",
    icon: "warning",
    title: `Retry ${part.attempt}`,
    subtitle: part.error?.name,
    status: "error",
    detail: clip(JSON.stringify(part.error?.data ?? {}, null, 2), DETAIL_LIMIT),
  }
}

function subtaskStage(part: SubtaskPart): Stage {
  return {
    id: part.id,
    kind: "subtask",
    icon: "task",
    title: part.description || "Subtask",
    subtitle: part.agent,
    status: "completed",
    detail: clip(part.prompt ?? "", DETAIL_LIMIT) || undefined,
  }
}

function patchStage(part: PatchPart): Stage {
  return {
    id: part.id,
    kind: "patch",
    icon: "branch",
    title: "Snapshot patch",
    subtitle: `${part.files?.length ?? 0} files`,
    status: "completed",
    detail: clip((part.files ?? []).join("\n"), DETAIL_LIMIT) || undefined,
  }
}

function stage(part: Part): Stage | undefined {
  switch (part.type) {
    case "reasoning":
      return reasoningStage(part)
    case "tool":
      return toolStage(part)
    case "text":
      return textStage(part)
    case "step-finish":
      return stepStage(part)
    case "compaction":
      return {
        id: part.id,
        kind: "compaction",
        icon: "compress",
        title: "Context compaction",
        subtitle: part.auto ? "auto" : "manual",
        status: "completed",
      }
    case "file":
      return {
        id: part.id,
        kind: "file",
        icon: "eye",
        title: part.filename ?? "File",
        subtitle: part.mime,
        status: "completed",
      }
    case "retry":
      return retryStage(part)
    case "subtask":
      return subtaskStage(part)
    case "agent":
      return {
        id: part.id,
        kind: "agent",
        icon: "branch",
        title: part.name,
        status: "completed",
      }
    case "patch":
      return patchStage(part)
    default:
      return undefined
  }
}

/**
 * Group the message history into prompt runs: every user message opens a
 * run, and each assistant message contributes stages to the run named by
 * its parentID (falling back to the most recent run for orphan replies).
 */
export function buildRuns(items: MessageItem[]): Run[] {
  const runs: Run[] = []
  const byId = new Map<string, Run>()
  const sorted = [...items].sort((a, b) => a.info.time.created - b.info.time.created)
  for (const item of sorted) {
    const info = item.info
    if (info.role === "user") {
      const text = item.parts
        .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim()
      const run: Run = {
        id: info.id,
        index: runs.length + 1,
        text: clip(text, PROMPT_LIMIT),
        time: info.time.created,
        status: "pending",
        stages: [],
        tools: 0,
        tokens: { input: 0, output: 0 },
        cost: 0,
      }
      runs.push(run)
      byId.set(info.id, run)
      continue
    }
    const run = byId.get(info.parentID) ?? runs.at(-1)
    if (!run) continue
    for (const part of item.parts) {
      const entry = stage(part)
      if (!entry) continue
      run.stages.push(entry)
      if (entry.kind === "tool") run.tools += 1
    }
    run.agent = info.agent
    run.model = `${info.providerID}/${info.modelID}`
    run.cost += info.cost ?? 0
    run.tokens.input += info.tokens?.input ?? 0
    run.tokens.output += info.tokens?.output ?? 0
    const failed = info.error || run.stages.some((s) => s.kind === "tool" && s.status === "error")
    if (failed) run.status = "error"
    else if (run.status !== "error") run.status = info.time.completed ? "completed" : "running"
    if (info.time.completed) run.duration = info.time.completed - run.time
  }
  return runs
}
