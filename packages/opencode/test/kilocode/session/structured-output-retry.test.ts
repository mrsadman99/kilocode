import path from "path"
import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Agent } from "@/agent/agent"
import * as MCP from "@/mcp"
import { BackgroundJob } from "@/background/job"
import { Command } from "@/command"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Permission } from "@/permission"
import { Question } from "@/question"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { SessionStatus } from "@/session/status"
import { SessionRunState } from "@/session/run-state"
import { TestInstance } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"
import { reply, TestLLMServer } from "../../lib/llm-server"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      SessionPrompt.node,
      Session.node,
      SessionProjector.node,
      SessionStatus.node,
      SessionRunState.node,
      Agent.node,
      MCP.node,
      BackgroundJob.node,
      Command.node,
      EventV2Bridge.node,
      Permission.node,
      Question.node,
      FSUtil.node,
      LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] }),
    ]),
  ),
)

const schema = { type: "object", properties: { answer: { type: "number" } }, required: ["answer"] }

// prompt.prompt does not schema-decode its input (the HTTP layer does), so build a
// decoded Format instance the same way the API boundary would.
const format = (retryCount?: number) =>
  Schema.decodeUnknownSync(SessionV1.Format)({
    type: "json_schema",
    schema,
    ...(retryCount !== undefined ? { retryCount } : {}),
  })

const setup = Effect.fnUntraced(function* () {
  const llm = yield* TestLLMServer
  const fs = yield* FSUtil.Service
  const instance = yield* TestInstance
  const model = {
    name: "Test Model",
    tool_call: true,
    attachment: true,
    modalities: { input: ["text"], output: ["text"] },
    limit: { context: 100000, output: 10000 },
  }
  yield* fs.writeWithDirs(
    path.join(instance.directory, "opencode.json"),
    JSON.stringify({
      model: "test/test-model",
      small_model: "test/test-model",
      enabled_providers: ["test"],
      formatter: false,
      lsp: false,
      provider: {
        test: {
          name: "Test",
          npm: "@ai-sdk/openai-compatible",
          options: { apiKey: "test-key", baseURL: llm.url },
          models: { "test-model": model },
        },
      },
    }),
  )
  const sessions = yield* Session.Service
  const prompt = yield* SessionPrompt.Service
  const session = yield* sessions.create({ title: "Structured output retry" })
  return { llm, prompt, session }
})

it.instance(
  "retries with a reminder when the model skips the StructuredOutput tool",
  Effect.gen(function* () {
    const { llm, prompt, session } = yield* setup()
    // First attempt: plain text, no tool call. Second attempt: the required tool call.
    yield* llm.push(reply().text("The answer is 4.").stop())
    yield* llm.push(reply().tool("StructuredOutput", { answer: 4 }))

    const result = yield* prompt.prompt({
      sessionID: session.id,
      parts: [{ type: "text", text: "What is 2 + 2?" }],
      format: format(),
    })

    expect(result.info.role).toBe("assistant")
    if (result.info.role === "assistant") {
      expect(result.info.structured).toEqual({ answer: 4 })
      expect(result.info.error).toBeUndefined()
    }
    // The retry actually happened, and the reminder reached the model.
    expect(yield* llm.calls).toBe(2)
    const inputs = yield* llm.inputs
    expect(JSON.stringify(inputs.at(-1))).toContain("did not call the StructuredOutput tool")
  }),
)

it.instance(
  "does not retry when retryCount is 0",
  Effect.gen(function* () {
    const { llm, prompt, session } = yield* setup()
    yield* llm.push(reply().text("The answer is 4.").stop())

    const result = yield* prompt.prompt({
      sessionID: session.id,
      parts: [{ type: "text", text: "What is 2 + 2?" }],
      format: format(0),
    })

    expect(result.info.role).toBe("assistant")
    if (result.info.role === "assistant") {
      expect(result.info.structured).toBeUndefined()
      expect(result.info.error).toBeDefined()
    }
    expect(yield* llm.calls).toBe(1)
  }),
)