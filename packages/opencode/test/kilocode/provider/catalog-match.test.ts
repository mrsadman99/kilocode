import { describe, expect, test } from "bun:test"
import { find } from "../../../src/kilocode/provider/catalog-match"

const catalog = {
  "acme-plan": {
    api: "https://plan.ap-southeast-1.maas.acme.test/compatible-mode/v1",
    models: { "acme-max": {}, "acme-flash": {} },
  },
  "acme-plan-cn": {
    api: "https://plan.cn-hangzhou.maas.acme.test/compatible-mode/v1",
    models: { "acme-max": {} },
  },
  "acme-other": {
    api: "https://api.acme.test/v1",
    models: { "other-model": {} },
  },
}

describe("catalog match", () => {
  test("exact URL matches", () => {
    expect(find("https://plan.ap-southeast-1.maas.acme.test/compatible-mode/v1", catalog)).toBe("acme-plan")
  })

  test("regional host labels are normalized away", () => {
    expect(find("https://plan.maas.acme.test/compatible-mode/v1", catalog)).toBe("acme-plan")
    expect(find("https://plan.us-central1.maas.acme.test/compatible-mode/v1", catalog)).toBe("acme-plan")
    const cn = { "acme-plan-cn": catalog["acme-plan-cn"] }
    expect(find("https://plan.cn-hangzhou.maas.acme.test/compatible-mode/v1", cn)).toBe("acme-plan-cn")
  })

  test("indistinguishable regional variants resolve deterministically", () => {
    expect(find("https://plan.cn-hangzhou.maas.acme.test/compatible-mode/v1", catalog)).toBe("acme-plan")
  })

  test("known vendor domain aliases match across brands", () => {
    const alibaba = {
      "alibaba-token-plan": {
        api: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
        models: { "qwen4-max": {} },
      },
    }
    expect(find("https://token-plan.maas.qwencloudapi.com/compatible-mode/v1", alibaba)).toBe("alibaba-token-plan")
  })

  test("intl suffix is normalized", () => {
    const dashscope = {
      alibaba: { api: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: {} },
    }
    expect(find("https://dashscope-intl.aliyuncs.com/compatible-mode/v1", dashscope)).toBe("alibaba")
  })

  test("scheme, trailing slash, host case and port are ignored", () => {
    expect(find("http://PLAN.AP-SOUTHEAST-1.MAAS.ACME.TEST:443/compatible-mode/v1/", catalog)).toBe("acme-plan")
  })

  test("same subdomains and path match an unknown regional domain", () => {
    expect(find("https://plan.maas.acme-cloud.test/compatible-mode/v1", catalog)).toBe("acme-plan")
  })

  test("different path does not match", () => {
    expect(find("https://plan.maas.acme.test/v1", catalog)).toBeUndefined()
    expect(find("https://plan.maas.acme-cloud.test/other/v1", catalog)).toBeUndefined()
  })

  test("generic-only subdomains do not match across domains", () => {
    expect(find("https://api.acme-cloud.test/v1", catalog)).toBeUndefined()
    expect(find("https://www.acme-cloud.test/v1", catalog)).toBeUndefined()
  })

  test("different subdomains do not match", () => {
    expect(find("https://chat.maas.acme.test/compatible-mode/v1", catalog)).toBeUndefined()
    expect(find("https://plan.maas.acme.test/compatible-mode/v2", catalog)).toBeUndefined()
  })

  test("bare registrable domains do not fuzzy match", () => {
    const bare = { one: { api: "https://acme.test/v1", models: {} } }
    expect(find("https://acme-cloud.test/v1", bare)).toBeUndefined()
  })

  test("invalid or missing URLs yield no match", () => {
    expect(find("not a url", catalog)).toBeUndefined()
    expect(find("", catalog)).toBeUndefined()
    expect(find(undefined, catalog)).toBeUndefined()
    expect(find(42, catalog)).toBeUndefined()
    expect(find("ftp://plan.maas.acme.test/compatible-mode/v1", catalog)).toBeUndefined()
    expect(find("localhost:8080/v1", catalog)).toBeUndefined()
    expect(find("https://plan.maas.acme.test/compatible-mode/v1", { broken: { models: {} } })).toBeUndefined()
  })

  test("model overlap breaks ties between equal matches", () => {
    const tied = {
      "z-plan": { api: "https://plan.maas.acme.test/compatible-mode/v1", models: { "acme-flash": {} } },
      "a-plan": { api: "https://plan.maas.acme.test/compatible-mode/v1", models: { "acme-max": {} } },
    }
    expect(find("https://plan.maas.acme.test/compatible-mode/v1", tied, ["acme-max"])).toBe("a-plan")
    expect(find("https://plan.maas.acme.test/compatible-mode/v1", tied, ["acme-flash"])).toBe("z-plan")
    expect(find("https://plan.maas.acme.test/compatible-mode/v1", tied)).toBe("a-plan")
  })

  test("exact match wins over fuzzy match", () => {
    const mixed = {
      fuzzy: { api: "https://plan.maas.acme-cloud.test/compatible-mode/v1", models: { "acme-max": {}, "acme-flash": {} } },
      exact: { api: "https://plan.maas.acme.test/compatible-mode/v1", models: {} },
    }
    expect(find("https://plan.maas.acme.test/compatible-mode/v1", mixed, ["acme-max"])).toBe("exact")
  })
})
