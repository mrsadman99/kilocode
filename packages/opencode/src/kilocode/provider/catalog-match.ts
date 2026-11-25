/**
 * Match a custom provider's API base URL against models.dev catalog entries.
 * Regional host labels (ap-southeast-1, cn-hangzhou, us-central1, ...) and
 * known multi-domain vendor aliases are normalized away, so a custom endpoint
 * like token-plan.maas.qwencloudapi.com still matches the catalog entry on
 * token-plan.ap-southeast-1.maas.aliyuncs.com. Only metadata is inherited from
 * a match; requests keep going to the user-configured URL.
 */

type Catalog = Record<string, { api?: string; models: Record<string, unknown> }>

const GENERIC = new Set([
  "www",
  "api",
  "app",
  "maas",
  "chat",
  "gateway",
  "proxy",
  "cloud",
  "service",
  "openai",
  "anthropic",
  "azure",
])

const ALIAS: Record<string, string> = {
  "qwencloudapi.com": "aliyuncs.com",
}

const REGION = [
  /^[a-z]{2}-[a-z]+-\d+$/,
  /^cn-[a-z]+$/,
  /^(us|eu|europe|asia|me|af|sa|au|australia|northamerica|southamerica)-[a-z]+\d+$/,
]

function labels(host: string) {
  const parts = host.split(".").map((label) => label.replace(/-intl$/, ""))
  const kept = parts.filter((label) => !REGION.some((pattern) => pattern.test(label)))
  const domain = kept.slice(-2).join(".")
  return [...kept.slice(0, -2), ...(ALIAS[domain] ?? domain).split(".")]
}

function parse(value: string) {
  if (!URL.canParse(value)) return undefined
  const url = new URL(value)
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
  return { host: labels(url.hostname), path: url.pathname.replace(/\/+$/, "") }
}

type Parsed = NonNullable<ReturnType<typeof parse>>

function tier(target: Parsed, source: Parsed) {
  if (target.path !== source.path) return 0
  if (target.host.join(".") === source.host.join(".")) return 1
  const a = target.host.slice(0, -2)
  const b = source.host.slice(0, -2)
  if (a.length === 0 || a.join(".") !== b.join(".")) return 0
  if (!a.some((label) => !GENERIC.has(label))) return 0
  return 2
}

export function find(url: unknown, catalog: Catalog, ids?: string[]): string | undefined {
  if (typeof url !== "string" || url === "") return undefined
  const target = parse(url)
  if (!target) return undefined
  const wanted = new Set(ids ?? [])
  const scored = Object.entries(catalog).flatMap(([id, provider]) => {
    if (typeof provider.api !== "string" || provider.api === "") return []
    const source = parse(provider.api)
    if (!source) return []
    const rank = tier(target, source)
    if (rank === 0) return []
    const overlap = Object.keys(provider.models).filter((key) => wanted.has(key)).length
    return [{ id, rank, overlap }]
  })
  const best = scored.sort((a, b) => a.rank - b.rank || b.overlap - a.overlap || a.id.localeCompare(b.id)).at(0)
  return best?.id
}
