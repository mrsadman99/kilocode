import { describe, expect, it } from "bun:test"
import { authorizeProviderOAuth, completeProviderOAuth } from "../../src/provider-actions"

function createCtx() {
  const calls: Array<{ providerID: string; method: number; directory?: string; inputs?: Record<string, string> }> = []
  const posts: unknown[] = []

  const ctx = {
    client: {
      provider: {
        oauth: {
          authorize: async (input: {
            providerID: string
            method: number
            directory?: string
            inputs?: Record<string, string>
          }) => {
            calls.push(input)
            return { data: { url: "", method: "auto", instructions: "sign in with az login" } }
          },
        },
      },
    },
    postMessage: (message: unknown) => posts.push(message),
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    workspaceDir: "/tmp",
    disposeGlobal: async () => {},
    fetchAndSendProviders: async () => {},
  }

  return { calls, posts, ctx }
}

describe("authorizeProviderOAuth", () => {
  it("forwards prompt inputs to the oauth authorize call", async () => {
    const { calls, posts, ctx } = createCtx()
    const inputs = { endpointType: "resourceName", resourceName: "my-resource" }

    await authorizeProviderOAuth(ctx as never, "req-1", "azure", 1, inputs)

    expect(calls).toEqual([{ providerID: "azure", method: 1, directory: "/tmp", inputs }])
    expect(posts).toContainEqual({
      type: "providerOAuthReady",
      requestId: "req-1",
      providerID: "azure",
      authorization: { url: "", method: "auto", instructions: "sign in with az login" },
    })
  })

  it("omits inputs when none are supplied", async () => {
    const { calls, ctx } = createCtx()

    await authorizeProviderOAuth(ctx as never, "req-2", "azure", 0)

    expect(calls).toEqual([{ providerID: "azure", method: 0, directory: "/tmp", inputs: undefined }])
  })
})

function createCompleteCtx() {
  const calls = {
    callback: [] as Array<{ providerID: string; method: number; code?: string }>,
    config: [] as Array<{ config: Record<string, unknown> }>,
    posts: [] as unknown[],
  }
  const ctx = {
    client: {
      provider: {
        oauth: {
          callback: async (input: { providerID: string; method: number; code?: string }) => {
            calls.callback.push(input)
            return { data: true }
          },
        },
      },
      global: {
        config: {
          update: async (input: { config: Record<string, unknown> }) => {
            calls.config.push(input)
            return { data: input }
          },
        },
      },
    },
    postMessage: (message: unknown) => calls.posts.push(message),
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    workspaceDir: "/tmp",
    disposeGlobal: async () => {},
    fetchAndSendProviders: async () => {},
  }
  return { calls, ctx }
}

describe("completeProviderOAuth with proxy", () => {
  it("persists the proxy before the provider reload", async () => {
    const { calls, ctx } = createCompleteCtx()
    await completeProviderOAuth(ctx as never, "req", "openai", 0, undefined, "http://127.0.0.1:8080")
    expect(calls.callback).toEqual([{ providerID: "openai", method: 0, code: undefined, directory: "/tmp" }])
    expect(calls.config).toEqual([
      { config: { provider: { openai: { options: { proxy: "http://127.0.0.1:8080" } } } } },
    ])
    expect(calls.posts.at(-1)).toEqual({ type: "providerConnected", requestId: "req", providerID: "openai" })
  })

  it("clears the proxy with a null sentinel when empty", async () => {
    const { calls, ctx } = createCompleteCtx()
    await completeProviderOAuth(ctx as never, "req", "openai", 0, undefined, "")
    expect(calls.config).toEqual([{ config: { provider: { openai: { options: { proxy: null } } } } }])
  })

  it("rejects an invalid proxy without completing auth", async () => {
    const { calls, ctx } = createCompleteCtx()
    await completeProviderOAuth(ctx as never, "req", "openai", 0, undefined, "ftp://127.0.0.1:21")
    expect(calls.callback).toEqual([])
    expect(calls.config).toEqual([])
    expect(calls.posts.at(-1)).toMatchObject({ type: "providerActionError", providerID: "openai" })
  })
})

function createAuthorizeCtx() {
  const calls = {
    seq: [] as string[],
    config: [] as Array<{ config: Record<string, unknown> }>,
    authorize: [] as Array<{ providerID: string; method: number }>,
    posts: [] as unknown[],
  }
  const ctx = {
    client: {
      provider: {
        oauth: {
          authorize: async (input: { providerID: string; method: number }) => {
            calls.seq.push("authorize")
            calls.authorize.push(input)
            return { data: { url: "", method: "auto", instructions: "" } }
          },
        },
      },
      global: {
        config: {
          get: async () => ({ data: {} }),
          update: async (input: { config: Record<string, unknown> }) => {
            calls.seq.push("config")
            calls.config.push(input)
            return { data: input }
          },
        },
      },
      config: { get: async () => ({ data: {} }) },
    },
    postMessage: (message: unknown) => calls.posts.push(message),
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    workspaceDir: "/tmp",
    disposeGlobal: async () => {},
    fetchAndSendProviders: async () => {},
  }
  return { calls, ctx }
}

describe("authorizeProviderOAuth with proxy", () => {
  it("persists the proxy before starting OAuth so the token exchange can use it", async () => {
    const { calls, ctx } = createAuthorizeCtx()
    await authorizeProviderOAuth(ctx as never, "req", "openai", 0, undefined, "http://127.0.0.1:8080")
    expect(calls.config).toEqual([
      { config: { provider: { openai: { options: { proxy: "http://127.0.0.1:8080" } } } } },
    ])
    expect(calls.seq.indexOf("config")).toBeLessThan(calls.seq.indexOf("authorize"))
    expect(calls.posts.at(-1)).toMatchObject({ type: "providerOAuthReady", providerID: "openai" })
  })

  it("rejects an invalid proxy without starting OAuth", async () => {
    const { calls, ctx } = createAuthorizeCtx()
    await authorizeProviderOAuth(ctx as never, "req", "openai", 0, undefined, "ftp://127.0.0.1:21")
    expect(calls.authorize).toEqual([])
    expect(calls.config).toEqual([])
    expect(calls.posts.at(-1)).toMatchObject({ type: "providerActionError", providerID: "openai" })
  })
})
