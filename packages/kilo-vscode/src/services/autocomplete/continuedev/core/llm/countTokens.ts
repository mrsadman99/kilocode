import { Tiktoken, encodingForModel as _encodingForModel } from "js-tiktoken"
import QuickLRU from "quick-lru"
import type { MessageContent } from "../index.js"
import { llamaTokenizer } from "./llamaTokenizer.js"

interface Encoding {
  encode: Tiktoken["encode"]
  decode: Tiktoken["decode"]
}

class LlamaEncoding implements Encoding {
  encode(text: string): number[] {
    return llamaTokenizer.encode(text)
  }

  decode(tokens: number[]): string {
    return llamaTokenizer.decode(tokens)
  }
}

let gptEncoding: Encoding | null = null
const llamaEncoding = new LlamaEncoding()

function modelUsesGptTokenizer(modelName: string): boolean {
  const name = (modelName || "").toLowerCase()
  const patterns: (RegExp | string)[] = [
    /^gpt/,
    /^o3/,
    /^o4/,
    "command-r",
    "aya",
    "chat-bison",
    "pplx",
    "gemini",
    "grok",
    "moonshot",
    "claude",
    "codestral",
    "nova",
  ]
  return patterns.some((p) => (typeof p === "string" ? name.includes(p) : p.test(name)))
}

export function encodingForModel(modelName: string): Encoding {
  if (!modelUsesGptTokenizer(modelName)) return llamaEncoding
  return (gptEncoding ??= _encodingForModel("gpt-4"))
}

export function countTokens(
  content: MessageContent,
  // defaults to llama2 because the tokenizer tends to produce more tokens
  modelName = "llama2",
): number {
  const encoding = encodingForModel(modelName)
  if (Array.isArray(content)) {
    return content.reduce((acc, part) => {
      return acc + encoding.encode(part.text ?? "", "all", []).length
    }, 0)
  }
  return encoding.encode(content ?? "", "all", []).length
}

const lineCache = new QuickLRU<string, number>({ maxSize: 4096 })
const CACHEABLE_LINE = 1000

function lineTokens(line: string, modelName: string): number {
  if (line.length > CACHEABLE_LINE) return countTokens(line, modelName)
  const key = `${modelUsesGptTokenizer(modelName) ? "g" : "l"}\0${line}`
  const hit = lineCache.get(key)
  if (hit !== undefined) return hit
  const count = countTokens(line, modelName)
  lineCache.set(key, count)
  return count
}

export function pruneLinesFromTop(prompt: string, maxTokens: number, modelName: string): string {
  const lines = prompt.split("\n")
  let acc = 0
  let start = lines.length
  for (let i = lines.length - 1; i >= 0; i--) {
    const next = acc + lineTokens(lines[i]!, modelName) + (i < lines.length - 1 ? 1 : 0)
    if (next > maxTokens) break
    acc = next
    start = i
  }
  return lines.slice(start).join("\n")
}

export function pruneLinesFromBottom(prompt: string, maxTokens: number, modelName: string): string {
  const lines = prompt.split("\n")
  let acc = 0
  let end = 0
  for (let i = 0; i < lines.length; i++) {
    const next = acc + lineTokens(lines[i]!, modelName) + (i > 0 ? 1 : 0)
    if (next > maxTokens) break
    acc = next
    end = i + 1
  }
  return lines.slice(0, end).join("\n")
}

export function pruneStringFromBottom(modelName: string, maxTokens: number, prompt: string): string {
  const encoding = encodingForModel(modelName)
  const tokens = encoding.encode(prompt, "all", [])
  if (tokens.length <= maxTokens) {
    return prompt
  }
  return encoding.decode(tokens.slice(0, maxTokens))
}
