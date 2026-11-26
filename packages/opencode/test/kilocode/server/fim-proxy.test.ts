import * as HttpApiServer from "@/server/routes/instance/httpapi/server"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { ConfigProvider, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { resetDatabase } from "../../fixture/db"
import { disposeAllInstances, tmpdir } from "../../fixture/fixture"

const SSE = 'data: {"choices":[{"text":"ok"}]}\n\ndata: [DONE]\n\n'
const PROXY_ENV = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"] as const

function app() {
  const handler = HttpRouter.toWebHandler(
    HttpApiServer.routes.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            KILO_EXPERIMENTAL_DISABLE_FILEWATCHER: process.env.KILO_EXPERIMENTAL_DISABLE_FILEWATCHER ?? "true",
          }),
        ),
      ),
    ),
    { disableLogger: true },
  ).handler

  return {
    request(input: string, init?: RequestInit) {
      return handler(new Request(new URL(input, "http://localhost"), init), HttpApiServer.context)
    },
  }
}

const state = {
  target: null as ReturnType<typeof Bun.serve> | null,
  proxy: null as ReturnType<typeof Bun.serve> | null,
  via: [] as string[],
  saved: {} as Record<string, string | undefined>,
}

function fim(dir: string, baseURL: string, proxy?: string) {
  return app().request("/kilo/fim", {
    method: "POST",
    headers: { "content-type": "application/json", "x-kilo-directory": dir },
    body: JSON.stringify({
      prefix: "def hello():\n    ",
      suffix: "\n",
      provider: "local",
      model: "qwen2.5-coder:7b",
      baseURL,
      endpoint: "completions",
      ...(proxy ? { proxy } : {}),
    }),
  })
}

beforeAll(() => {
  for (const key of PROXY_ENV) {
    state.saved[key] = process.env[key]
    process.env[key] = ""
  }
  state.target = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      state.via.push(req.headers.get("x-via-proxy") ?? "direct")
      return new Response(SSE, { headers: { "content-type": "text/event-stream" } })
    },
  })
  state.proxy = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const headers = new Headers(req.headers)
      headers.set("x-via-proxy", "1")
      const body = await req.arrayBuffer()
      return fetch(req.url, { method: req.method, headers, body })
    },
  })
})

afterAll(() => {
  state.target?.stop(true)
  state.proxy?.stop(true)
  for (const key of PROXY_ENV) {
    const value = state.saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

afterEach(async () => {
  state.via.length = 0
  for (const key of PROXY_ENV) process.env[key] = ""
  await disposeAllInstances()
  await resetDatabase()
})

describe("fim proxy", () => {
  test("routes local FIM through the per-provider config proxy", async () => {
    await using tmp = await tmpdir({
      config: {
        provider: {
          local: { options: { proxy: `http://127.0.0.1:${state.proxy!.port}` } },
        },
      },
    })
    const response = await fim(tmp.path, `http://127.0.0.1:${state.target!.port}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(SSE)
    expect(state.via).toEqual(["1"])
  })

  test("routes local FIM through the request payload proxy", async () => {
    await using tmp = await tmpdir({ config: {} })
    const response = await fim(
      tmp.path,
      `http://127.0.0.1:${state.target!.port}`,
      `http://127.0.0.1:${state.proxy!.port}`,
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(SSE)
    expect(state.via).toEqual(["1"])
  })

  test("keeps loopback FIM direct when an env proxy is set", async () => {
    for (const key of PROXY_ENV) process.env[key] = "http://127.0.0.1:1"
    await using tmp = await tmpdir({ config: {} })
    const response = await fim(tmp.path, `http://127.0.0.1:${state.target!.port}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(SSE)
    expect(state.via).toEqual(["direct"])
  })
})
