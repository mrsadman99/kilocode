import {
  DEFAULT_LOCAL_MODEL,
  FIM_TEMPLATE_IDS,
  matchFimProfile,
  profiles,
} from "../../../../src/shared/autocomplete-models"

/**
 * Pure mapping between the persisted `customFormat` value and the three
 * user-facing input modes. Kept free of Solid and DOM imports so it is
 * unit-testable alongside the settings search index.
 */

export type CustomInputMode = "native" | "raw" | "chat"
export type CustomTransport = "completions" | "generate"
export type CustomFormat = "openai" | "completions" | "generate" | "chat"

/** "openai" is native FIM; "completions"/"generate" are raw; "chat" is chat. */
export function modeFromFormat(format: unknown): CustomInputMode {
  if (format === "chat") return "chat"
  if (format === "completions" || format === "generate") return "raw"
  return "native"
}

export function transportFromFormat(format: unknown): CustomTransport {
  return format === "generate" ? "generate" : "completions"
}

export function formatForMode(mode: CustomInputMode, transport: CustomTransport): CustomFormat {
  if (mode === "chat") return "chat"
  if (mode === "raw") return transport
  return "openai"
}

export interface ProfileOption {
  value: string
  label: string
}

export function profileOptions(autoLabel: string, chat = false): ProfileOption[] {
  const options: ProfileOption[] = [{ value: "auto", label: autoLabel }]
  for (const id of FIM_TEMPLATE_IDS) {
    if (chat && profiles[id].rawOnly) continue
    options.push({ value: id, label: profiles[id].label })
  }
  return options
}

export type AutoResolution =
  | { kind: "explicit" }
  | { kind: "resolved"; id: string; label: string; model: string }
  | { kind: "unknown"; model: string }
  | { kind: "unconfigured" }

/**
 * Explain what the "auto" profile resolves to so the UI can tell the user
 * instead of silently assuming a profile. A blank raw model falls back to the
 * default local checkpoint; a blank chat model is unconfigured (chat needs an
 * explicit model). An unrecognized model surfaces as `unknown`.
 */
export function resolveAutoProfile(template: unknown, model: string, isChat: boolean): AutoResolution {
  if (typeof template === "string" && template !== "auto") return { kind: "explicit" }
  const name = model.trim()
  if (isChat && !name) return { kind: "unconfigured" }
  const target = name || DEFAULT_LOCAL_MODEL
  const id = matchFimProfile(target)
  if (!id) return { kind: "unknown", model: target }
  // A raw-only base model cannot fill the hole through the chat transport; ask
  // the user to pick a chat-capable profile instead of failing at request time.
  if (isChat && profiles[id].rawOnly) return { kind: "unknown", model: target }
  return { kind: "resolved", id, label: profiles[id].label, model: target }
}
