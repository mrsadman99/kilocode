import { describe, expect, it } from "bun:test"
import type { AssistantMessage, Part, UserMessage } from "@kilocode/sdk/v2/client"
import { buildRuns, type MessageItem } from "../../src/prompt-timeline/runs"

const sid = "ses_test"

function user(id: string, created: number, text: string): MessageItem {
  const info: UserMessage = {
    id,
    sessionID: sid,
    role: "user",
    time: { created },
    agent: "build",
    model: { providerID: "anthropic", modelID: "claude" },
  }
  const parts: Part[] = [{ id: `${id}-text`, sessionID: sid, messageID: id, type: "text", text }]
  return { info, parts }
}

function assistant(
  id: string,
  parentID: string,
  created: number,
  parts: Part[],
  extra: Partial<AssistantMessage> = {},
): MessageItem {
  const info: AssistantMessage = {
    id,
    sessionID: sid,
    role: "assistant",
    time: { created, completed: created + 1000 },
    parentID,
    modelID: "claude",
    providerID: "anthropic",
    mode: "build",
    agent: "build",
    path: { cwd: "/repo", root: "/repo" },
    cost: 0.01,
    tokens: { input: 100, output: 50, reasoning: 10, cache: { read: 0, write: 0 } },
    ...extra,
  }
  return { info, parts }
}

function tool(id: string, name: string, state: Extract<Part, { type: "tool" }>["state"]): Part {
  return { id, sessionID: sid, messageID: "m", type: "tool", callID: `call-${id}`, tool: name, state }
}

describe("buildRuns", () => {
  it("groups assistant replies under their user prompt", () => {
    const runs = buildRuns([
      user("u1", 1000, "first prompt"),
      assistant("a1", "u1", 1100, [
        {
          id: "p1",
          sessionID: sid,
          messageID: "a1",
          type: "text",
          text: "first answer",
          time: { start: 1100, end: 1200 },
        },
      ]),
      user("u2", 2000, "second prompt"),
      assistant("a2", "u2", 2100, [
        {
          id: "p2",
          sessionID: sid,
          messageID: "a2",
          type: "text",
          text: "second answer",
          time: { start: 2100, end: 2200 },
        },
      ]),
    ])
    expect(runs.length).toBe(2)
    expect(runs[0]!.id).toBe("u1")
    expect(runs[0]!.index).toBe(1)
    expect(runs[0]!.text).toBe("first prompt")
    expect(runs[0]!.stages.map((s) => s.kind)).toEqual(["response"])
    expect(runs[1]!.index).toBe(2)
    expect(runs[1]!.stages.length).toBe(1)
  })

  it("derives stage kinds, statuses and durations from parts", () => {
    const runs = buildRuns([
      user("u1", 1000, "do work"),
      assistant("a1", "u1", 1100, [
        {
          id: "r1",
          sessionID: sid,
          messageID: "a1",
          type: "reasoning",
          text: "thinking hard\nmore",
          time: { start: 1100, end: 1600 },
        },
        tool("t1", "read", {
          status: "completed",
          input: { filePath: "/repo/src/auth.ts" },
          output: "file contents",
          title: "Read auth.ts",
          metadata: {},
          time: { start: 1600, end: 1900 },
        }),
        {
          id: "s1",
          sessionID: sid,
          messageID: "a1",
          type: "step-finish",
          reason: "stop",
          cost: 0.02,
          tokens: { input: 200, output: 80, reasoning: 5, cache: { read: 0, write: 0 } },
          time: { start: 1100, end: 2000, elapsed: 900 },
        },
      ]),
    ])
    const run = runs[0]!
    expect(run.stages.map((s) => s.kind)).toEqual(["reasoning", "tool", "step"])
    expect(run.stages[0]!.duration).toBe(500)
    expect(run.stages[0]!.subtitle).toBe("thinking hard")
    const toolStage = run.stages[1]!
    expect(toolStage.icon).toBe("glasses")
    expect(toolStage.title).toBe("Read auth.ts")
    expect(toolStage.subtitle).toBe("auth.ts")
    expect(toolStage.status).toBe("completed")
    expect(toolStage.duration).toBe(300)
    expect(toolStage.detail).toBe("file contents")
    expect(run.stages[2]!.tokens).toEqual({ input: 200, output: 80 })
    expect(run.stages[2]!.duration).toBe(900)
    expect(run.tools).toBe(1)
    expect(run.status).toBe("completed")
    expect(run.duration).toBe(1100)
  })

  it("marks the run errored when a tool fails and keeps the error sticky", () => {
    const runs = buildRuns([
      user("u1", 1000, "break things"),
      assistant("a1", "u1", 1100, [
        tool("t1", "bash", {
          status: "error",
          input: { command: "false" },
          error: "exit code 1",
          time: { start: 1100, end: 1200 },
        }),
      ]),
      assistant("a2", "u1", 1300, [
        { id: "p1", sessionID: sid, messageID: "a2", type: "text", text: "sorry", time: { start: 1300, end: 1400 } },
      ]),
    ])
    const run = runs[0]!
    expect(run.stages[0]!.status).toBe("error")
    expect(run.stages[0]!.detail).toBe("exit code 1")
    expect(run.status).toBe("error")
  })

  it("reports running while the latest reply is unfinished and pending without replies", () => {
    const runs = buildRuns([
      user("u1", 1000, "busy"),
      assistant("a1", "u1", 1100, [], { time: { created: 1100 } }),
      user("u2", 2000, "queued"),
    ])
    expect(runs[0]!.status).toBe("running")
    expect(runs[1]!.status).toBe("pending")
    expect(runs[1]!.stages).toEqual([])
  })

  it("accumulates cost and tokens across assistant messages", () => {
    const runs = buildRuns([
      user("u1", 1000, "multi step"),
      assistant("a1", "u1", 1100, []),
      assistant("a2", "u1", 1300, [], {
        cost: 0.03,
        tokens: { input: 300, output: 120, reasoning: 0, cache: { read: 0, write: 0 } },
      }),
    ])
    expect(runs[0]!.cost).toBeCloseTo(0.04)
    expect(runs[0]!.tokens).toEqual({ input: 400, output: 170 })
    expect(runs[0]!.model).toBe("anthropic/claude")
  })

  it("attaches orphan replies to the most recent run and sorts by creation time", () => {
    const runs = buildRuns([
      assistant("a1", "missing", 1500, [
        { id: "p1", sessionID: sid, messageID: "a1", type: "text", text: "orphan", time: { start: 1500, end: 1600 } },
      ]),
      user("u1", 1000, "prompt"),
    ])
    expect(runs.length).toBe(1)
    expect(runs[0]!.stages.length).toBe(1)
  })

  it("skips synthetic text and empty reasoning", () => {
    const runs = buildRuns([
      user("u1", 1000, "prompt"),
      assistant("a1", "u1", 1100, [
        { id: "p1", sessionID: sid, messageID: "a1", type: "text", text: "hidden", synthetic: true },
        { id: "r1", sessionID: sid, messageID: "a1", type: "reasoning", text: "   ", time: { start: 1100 } },
        { id: "p2", sessionID: sid, messageID: "a1", type: "text", text: "visible", time: { start: 1100, end: 1200 } },
      ]),
    ])
    expect(runs[0]!.stages.length).toBe(1)
    expect(runs[0]!.stages[0]!.detail).toBe("visible")
  })

  it("truncates long tool output and prompt text", () => {
    const long = "x".repeat(5000)
    const runs = buildRuns([
      user("u1", 1000, long),
      assistant("a1", "u1", 1100, [
        tool("t1", "bash", {
          status: "completed",
          input: { command: "cat big" },
          output: long,
          title: "cat big",
          metadata: {},
          time: { start: 1100, end: 1200 },
        }),
      ]),
    ])
    expect(runs[0]!.text.length).toBe(4001)
    expect(runs[0]!.text.endsWith("…")).toBe(true)
    expect(runs[0]!.stages[0]!.detail!.length).toBe(2001)
  })

  it("maps compaction, retry and subtask parts to stages", () => {
    const runs = buildRuns([
      user("u1", 1000, "prompt"),
      assistant("a1", "u1", 1100, [
        { id: "c1", sessionID: sid, messageID: "a1", type: "compaction", auto: true },
        {
          id: "rt1",
          sessionID: sid,
          messageID: "a1",
          type: "retry",
          attempt: 2,
          error: { name: "APIError", data: { message: "rate limited", statusCode: 429, isRetryable: true } },
          time: { created: 1100 },
        },
        {
          id: "st1",
          sessionID: sid,
          messageID: "a1",
          type: "subtask",
          prompt: "child task",
          description: "Research",
          agent: "explore",
        },
      ]),
    ])
    expect(runs[0]!.stages.map((s) => s.kind)).toEqual(["compaction", "retry", "subtask"])
    expect(runs[0]!.stages[1]!.status).toBe("error")
    expect(runs[0]!.stages[2]!.subtitle).toBe("explore")
  })
})
