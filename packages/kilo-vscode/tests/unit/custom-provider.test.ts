import { describe, expect, it } from "bun:test"
import {
  MASKED_CUSTOM_PROVIDER_KEY,
  parseCustomProviderSecret,
  resolveCustomProviderKey,
  resolveCustomProviderAuth,
  sanitizeCustomProviderConfig,
  validateProviderID,
  withCustomProviderDeletions,
  composeProxyURL,
  parseProxyURL,
  isProxyURL,
} from "../../src/shared/custom-provider"
import { isCustomProviderPackage } from "../../src/shared/provider-model"

describe("isCustomProviderPackage", () => {
  it("recognizes supported custom provider packages", () => {
    expect(isCustomProviderPackage("@ai-sdk/openai-compatible")).toBe(true)
    expect(isCustomProviderPackage("@ai-sdk/openai")).toBe(true)
    expect(isCustomProviderPackage("@ai-sdk/anthropic")).toBe(true)
    expect(isCustomProviderPackage("malicious-package")).toBe(false)
  })
})

describe("validateProviderID", () => {
  it("accepts valid provider ids", () => {
    expect(validateProviderID(" my-provider_1 ")).toEqual({ value: "my-provider_1" })
  })

  it("rejects invalid provider ids", () => {
    const result = validateProviderID("bad/id")
    expect("error" in result ? result.error : "").toBe("Invalid provider ID")
  })
})

describe("parseCustomProviderSecret", () => {
  it("treats plain values as api keys", () => {
    expect(parseCustomProviderSecret(" sk-test ")).toEqual({ value: { apiKey: "sk-test" } })
  })

  it("parses env references", () => {
    expect(parseCustomProviderSecret(" {env:MY_PROVIDER_KEY} ")).toEqual({ value: { env: "MY_PROVIDER_KEY" } })
  })

  it("rejects invalid env references", () => {
    const result = parseCustomProviderSecret("{env:bad-name}")
    expect("error" in result ? result.error : "").toBe("Invalid environment variable name")
  })
})

describe("resolveCustomProviderAuth", () => {
  it("preserves auth when the api key field is unchanged", () => {
    expect(resolveCustomProviderAuth(undefined, false)).toEqual({ mode: "preserve" })
  })

  it("stores a changed api key", () => {
    expect(resolveCustomProviderAuth(" sk-test ", true)).toEqual({ mode: "set", key: "sk-test" })
  })

  it("clears auth when the field was changed to empty", () => {
    expect(resolveCustomProviderAuth(undefined, true)).toEqual({ mode: "clear" })
  })
})

describe("resolveCustomProviderKey", () => {
  it("returns a masked value for api-backed providers", () => {
    expect(resolveCustomProviderKey("api")).toBe(MASKED_CUSTOM_PROVIDER_KEY)
  })

  it("hides non-api auth from the edit form", () => {
    expect(resolveCustomProviderKey("oauth")).toBe("")
  })

  it("returns empty when there is no saved key", () => {
    expect(resolveCustomProviderKey(undefined)).toBe("")
  })
})

describe("sanitizeCustomProviderConfig", () => {
  it("normalizes config and preserves an approved package", () => {
    const result = sanitizeCustomProviderConfig({
      npm: "@ai-sdk/anthropic",
      name: " My Provider ",
      env: [" MY_PROVIDER_KEY "],
      options: {
        baseURL: "https://example.com/v1 ",
        headers: {
          Authorization: " Bearer test ",
          " X-Test ": " 123 ",
        },
      },
      models: {
        " model-1 ": { name: " Model One " },
      },
    })

    expect(result).toEqual({
      value: {
        npm: "@ai-sdk/anthropic",
        name: "My Provider",
        env: ["MY_PROVIDER_KEY"],
        options: {
          baseURL: "https://example.com/v1",
          headers: {
            Authorization: "Bearer test",
            "X-Test": "123",
          },
        },
        models: {
          "model-1": { name: "Model One" },
        },
      },
    })
  })

  it("rejects unapproved packages", () => {
    const result = sanitizeCustomProviderConfig({
      npm: "malicious-package",
      name: "Bad Provider",
      options: { baseURL: "https://example.com/v1" },
      models: { "model-1": { name: "Model One" } },
    })

    expect("error" in result ? result.error : "").toContain("Invalid option")
  })

  it("accepts supported thinking variant options", () => {
    const result = sanitizeCustomProviderConfig({
      name: "Thinking Provider",
      options: { baseURL: "https://example.com/v1" },
      models: {
        "model-1": {
          name: "Model One",
          variants: {
            thinking: {
              thinking: { type: "adaptive" },
              reasoning_split: true,
              effort: "max",
              chat_template_args: { enable_thinking: true },
            },
          },
        },
      },
    })

    expect(result).toEqual({
      value: {
        npm: "@ai-sdk/openai-compatible",
        name: "Thinking Provider",
        options: { baseURL: "https://example.com/v1" },
        models: {
          "model-1": {
            name: "Model One",
            variants: {
              thinking: {
                thinking: { type: "adaptive" },
                reasoning_split: true,
                effort: "max",
                chat_template_args: { enable_thinking: true },
              },
            },
          },
        },
      },
    })
  })

  it("preserves opaque options on existing variants", () => {
    const variant = {
      thinking: { type: "adaptive", display: "summarized" },
      reasoningEffort: "max",
      reasoningSummary: "auto",
      include: ["reasoning.encrypted_content"],
      customOption: { enabled: true },
    }
    const result = sanitizeCustomProviderConfig({
      name: "Thinking Provider",
      options: { baseURL: "https://example.com/v1" },
      models: {
        "model-1": {
          name: "Model One",
          variants: { high: variant },
        },
      },
    })

    expect(result).toEqual({
      value: {
        npm: "@ai-sdk/openai-compatible",
        name: "Thinking Provider",
        options: { baseURL: "https://example.com/v1" },
        models: { "model-1": { name: "Model One", variants: { high: variant } } },
      },
    })
  })

  it("preserves core custom model modalities", () => {
    const result = sanitizeCustomProviderConfig({
      name: "Media Provider",
      options: { baseURL: "https://example.com/v1" },
      models: {
        "model-1": {
          name: "Model One",
          modalities: {
            input: ["text", "audio", "image", "video", "pdf"],
            output: ["text", "audio"],
          },
        },
      },
    })

    expect(result).toEqual({
      value: {
        npm: "@ai-sdk/openai-compatible",
        name: "Media Provider",
        options: { baseURL: "https://example.com/v1" },
        models: {
          "model-1": {
            name: "Model One",
            modalities: {
              input: ["text", "audio", "image", "video", "pdf"],
              output: ["text", "audio"],
            },
          },
        },
      },
    })
  })

  it("rejects unknown fields", () => {
    const result = sanitizeCustomProviderConfig({
      name: "Bad Provider",
      options: {
        baseURL: "https://example.com/v1",
        mcpServer: "https://malicious.example",
      },
      models: { "model-1": { name: "Model One" } },
    })

    expect("error" in result ? result.error : "").toContain("mcpServer")
  })
})

describe("withCustomProviderDeletions", () => {
  const baseNext = {
    npm: "@ai-sdk/openai-compatible" as const,
    name: "My Provider",
    options: { baseURL: "https://example.com/v1" },
    models: { keep: { name: "Keep" } },
  }

  it("passes through unchanged when there is no prior config", () => {
    expect(withCustomProviderDeletions(undefined, baseNext)).toEqual(baseNext)
    expect(withCustomProviderDeletions({}, baseNext)).toEqual(baseNext)
  })

  it("emits null for models present in existing but absent in next", () => {
    const existing = { models: { keep: { name: "Keep" }, gone: { name: "Gone" } } }
    const result = withCustomProviderDeletions(existing, baseNext)
    const models = result.models as Record<string, unknown>
    expect(models.keep).toEqual({ name: "Keep" })
    expect(models.gone).toBeNull()
  })

  it("emits null for reasoning and variants removed from a surviving model", () => {
    const existing = {
      models: {
        keep: {
          name: "Keep",
          reasoning: true,
          variants: { high: { reasoningEffort: "high" }, low: { reasoningEffort: "low" } },
        },
      },
    }
    const next = {
      ...baseNext,
      models: {
        keep: { name: "Keep", variants: { high: { reasoningEffort: "high" } } },
      },
    } as typeof baseNext
    const result = withCustomProviderDeletions(existing, next)
    const model = (result.models as Record<string, { reasoning?: boolean | null; variants?: Record<string, unknown> }>)
      .keep
    expect(model.reasoning).toBeNull()
    expect(model.variants?.high).toEqual({ reasoningEffort: "high" })
    expect(model.variants?.low).toBeNull()
  })

  it("emits null when reasoning is disabled on a surviving model", () => {
    const existing = { models: { keep: { name: "Keep", reasoning: true } } }
    const result = withCustomProviderDeletions(existing, baseNext)
    expect(result.models.keep).toEqual({ name: "Keep", reasoning: null })
  })

  it("emits null for options removed from a surviving variant", () => {
    const existing = {
      models: {
        keep: {
          name: "Keep",
          variants: {
            thinking: { thinking: { type: "adaptive" }, reasoning_split: true, reasoningEffort: "high" },
          },
        },
      },
    }
    const next = {
      ...baseNext,
      models: {
        keep: { name: "Keep", variants: { thinking: { reasoningEffort: "high" } } },
      },
    } as typeof baseNext
    const result = withCustomProviderDeletions(existing, next)
    const model = (result.models as Record<string, { variants: Record<string, unknown> }>).keep
    expect(model.variants.thinking).toEqual({ reasoningEffort: "high", thinking: null, reasoning_split: null })
  })

  it("does not touch variants on a model that is being deleted", () => {
    const existing = { models: { gone: { name: "Gone", variants: { a: {} } } } }
    const result = withCustomProviderDeletions(existing, baseNext)
    const models = result.models as Record<string, unknown>
    expect(models.gone).toBeNull()
  })

  it("emits null for a proxy removed from options", () => {
    const existing = { options: { baseURL: "https://example.com/v1", proxy: "http://127.0.0.1:8080" } }
    const result = withCustomProviderDeletions(existing, baseNext)
    expect((result.options as Record<string, unknown>).proxy).toBeNull()
  })

  it("keeps a proxy that is still present", () => {
    const existing = { options: { baseURL: "https://example.com/v1", proxy: "http://127.0.0.1:8080" } }
    const next = {
      ...baseNext,
      options: { baseURL: "https://example.com/v1", proxy: "socks5://127.0.0.1:1080" },
    } as typeof baseNext
    const result = withCustomProviderDeletions(existing, next)
    expect(result.options.proxy).toBe("socks5://127.0.0.1:1080")
  })
})

describe("proxy helpers", () => {
  it("isProxyURL accepts http/https/socks schemes and rejects others", () => {
    expect(isProxyURL("http://127.0.0.1:8080")).toBe(true)
    expect(isProxyURL("https://proxy.example.com:8443")).toBe(true)
    expect(isProxyURL("socks5://127.0.0.1:1080")).toBe(true)
    expect(isProxyURL("socks5h://user:pass@proxy:1080")).toBe(true)
    expect(isProxyURL("ftp://proxy:21")).toBe(false)
    expect(isProxyURL("not a url")).toBe(false)
  })

  it("composeProxyURL returns undefined for an empty address", () => {
    expect(composeProxyURL("", "user", "pass")).toBeUndefined()
    expect(composeProxyURL("   ", "", "")).toBeUndefined()
  })

  it("composeProxyURL defaults to http when no scheme is given", () => {
    expect(composeProxyURL("127.0.0.1:8080", "", "")).toBe("http://127.0.0.1:8080")
  })

  it("composeProxyURL embeds credentials and parseProxyURL round-trips them", () => {
    const url = composeProxyURL("socks5://proxy.example.com:1080", "user", "p@ss:word")
    expect(url).toBeDefined()
    const parsed = parseProxyURL(url)
    expect(parsed.address).toBe("socks5://proxy.example.com:1080")
    expect(parsed.user).toBe("user")
    expect(parsed.password).toBe("p@ss:word")
  })

  it("composeProxyURL without credentials yields an unauthenticated proxy", () => {
    const url = composeProxyURL("http://127.0.0.1:8080", "", "")
    expect(url).toBe("http://127.0.0.1:8080")
    expect(parseProxyURL(url)).toEqual({ address: "http://127.0.0.1:8080", user: "", password: "" })
  })

  it("parseProxyURL handles an empty proxy", () => {
    expect(parseProxyURL(undefined)).toEqual({ address: "", user: "", password: "" })
  })
})

describe("sanitizeCustomProviderConfig proxy", () => {
  it("accepts a valid proxy option", () => {
    const result = sanitizeCustomProviderConfig({
      name: "Proxy Provider",
      options: { baseURL: "https://example.com/v1", proxy: "socks5://user:pass@127.0.0.1:1080" },
      models: { "model-1": { name: "Model One" } },
    })
    expect("value" in result && result.value.options.proxy).toBe("socks5://user:pass@127.0.0.1:1080")
  })

  it("rejects an unsupported proxy scheme", () => {
    const result = sanitizeCustomProviderConfig({
      name: "Proxy Provider",
      options: { baseURL: "https://example.com/v1", proxy: "ftp://127.0.0.1:21" },
      models: { "model-1": { name: "Model One" } },
    })
    expect("error" in result).toBe(true)
  })
})
