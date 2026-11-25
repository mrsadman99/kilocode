import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { mkdir, rm, writeFile } from "fs/promises"
import path from "path"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import { Hash } from "@opencode-ai/core/util/hash"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelsDev } from "../../../src/provider/models"
import { Provider } from "../../../src/provider/provider"
import { it } from "../../lib/effect"

const model = (id: string, extra: Partial<ModelsDev.Model> = {}): ModelsDev.Model => ({
  id,
  name: id,
  release_date: "2026-06-01",
  attachment: false,
  reasoning: true,
  temperature: true,
  tool_call: true,
  limit: { context: 1_000_000, output: 131_072 },
  ...extra,
})

const catalog: Record<string, ModelsDev.Provider> = {
  "acme-plan": {
    id: "acme-plan",
    name: "Acme Plan",
    env: [],
    npm: "@ai-sdk/openai-compatible",
    api: "https://plan.ap-southeast-1.maas.acme.test/compatible-mode/v1",
    models: {
      "acme-max": model("acme-max", {
        reasoning_options: [{ type: "effort", values: ["low", "high", "xhigh"] }],
      }),
      "acme-toggle": model("acme-toggle", {
        reasoning_options: [{ type: "toggle" }, { type: "budget_tokens", max: 262_144 }],
      }),
      "acme-image": model("acme-image", { reasoning: false }),
      "acme-plain": model("acme-plain"),
    },
  },
}

const custom = {
  name: "My Acme",
  npm: "@ai-sdk/openai-compatible",
  models: {
    "acme-max": { reasoning: true },
    "acme-toggle": { reasoning: true },
    "acme-image": { reasoning: true },
    "acme-plain": { reasoning: true },
    "acme-unknown": { reasoning: true },
    "qwen-unknown": { reasoning: true },
  },
}

it.instance(
  "custom provider inherits catalog reasoning data when its API matches regionally",
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        Bun.serve({
          port: 0,
          fetch(request) {
            if (new URL(request.url).pathname !== "/api.json") return new Response("not found", { status: 404 })
            return Response.json(catalog)
          },
        }),
      ),
      (server) => Effect.sync(() => server.stop(true)),
    )
    const source = `http://127.0.0.1:${server.port}`
    const file = path.join(Global.Path.cache, `models-${Hash.fast(source)}.json`)
    const flags = {
      source: Flag.KILO_MODELS_URL,
      path: Flag.KILO_MODELS_PATH,
      disabled: Flag.KILO_DISABLE_MODELS_FETCH,
    }

    yield* Effect.acquireUseRelease(
      Effect.promise(async () => {
        Flag.KILO_MODELS_URL = source
        Flag.KILO_MODELS_PATH = undefined
        Flag.KILO_DISABLE_MODELS_FETCH = true
        await mkdir(Global.Path.cache, { recursive: true })
        await writeFile(file, JSON.stringify(catalog))
      }),
      () =>
        Effect.gen(function* () {
          const provider = yield* Provider.Service
          const all = yield* provider.list()
          const matched = all[ProviderV2.ID.make("my-acme")]
          expect(matched).toBeDefined()

          const max = matched?.models["acme-max"]
          expect(Object.keys(max?.variants ?? {})).toEqual(["low", "high", "xhigh"])
          expect(max?.variants?.high).toEqual({ reasoningEffort: "high" })
          expect(max?.limit.context).toBe(1_000_000)
          expect(max?.api.url).toBe("")

          expect(matched?.models["acme-toggle"]?.variants).toEqual({})
          expect(matched?.models["acme-image"]?.variants).toEqual({})
          expect(Object.keys(matched?.models["acme-plain"]?.variants ?? {})).toEqual(["low", "medium", "high"])
          expect(Object.keys(matched?.models["acme-unknown"]?.variants ?? {})).toEqual(["low", "medium", "high"])
          expect(Object.keys(matched?.models["qwen-unknown"]?.variants ?? {})).toEqual([
            "none",
            "low",
            "medium",
            "high",
            "xhigh",
            "max",
          ])

          const other = all[ProviderV2.ID.make("my-other")]
          expect(Object.keys(other?.models["acme-max"]?.variants ?? {})).toEqual(["low", "medium", "high"])
          expect(other?.models["acme-max"]?.limit.context).toBe(0)
        }).pipe(Effect.provide(Layer.merge(AppNodeBuilder.build(ModelsDev.node), AppNodeBuilder.build(Provider.node)))),
      () =>
        Effect.promise(async () => {
          Flag.KILO_MODELS_URL = flags.source
          Flag.KILO_MODELS_PATH = flags.path
          Flag.KILO_DISABLE_MODELS_FETCH = flags.disabled
          await rm(file, { force: true })
        }),
    )
  }),
  {
    config: {
      provider: {
        "my-acme": {
          ...custom,
          options: { baseURL: "https://plan.maas.acme-cloud.test/compatible-mode/v1" },
        },
        "my-other": {
          ...custom,
          options: { baseURL: "https://unrelated.example.test/v1" },
        },
      },
      disabled_providers: ["kilo", "apertis"],
    },
  },
)
