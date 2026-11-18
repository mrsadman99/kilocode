// Fill in the middle prompts
//
// Codestral is the only Gateway autocomplete model. The StarCoder, Qwen and
// CodeLlama templates below are used for local models (Ollama, llama.cpp,
// LM Studio), where the FIM prompt is assembled client-side.

import { CompletionOptions } from "../../index.js"
import { getLastNUriRelativePathParts, getShortestUniqueRelativeUriPaths } from "../../util/uri.js"
import { AutocompleteSnippet } from "../types.js"

type TemplateRenderer = (
  prefix: string,
  suffix: string,
  filepath: string,
  reponame: string,
  language: string,
  snippets: AutocompleteSnippet[],
  workspaceUris: string[],
) => string

export interface AutocompleteTemplate {
  compilePrefixSuffix?: (
    prefix: string,
    suffix: string,
    filepath: string,
    reponame: string,
    snippets: AutocompleteSnippet[],
    workspaceUris: string[],
  ) => [string, string]
  template: TemplateRenderer
  completionOptions?: Partial<CompletionOptions>
  /** Default local server API for this template; "generate" is Ollama-native. */
  endpoint?: "completions" | "generate"
}

export const codestralTemplate = {
  compilePrefixSuffix: (prefix, suffix, filepath, _reponame, snippets, workspaceUris): [string, string] => {
    function getFileName(snippet: { uri: string; uniquePath: string }) {
      return snippet.uri.startsWith("file://") ? snippet.uniquePath : snippet.uri
    }

    if (snippets.length === 0) {
      if (suffix.trim().length === 0 && prefix.trim().length === 0) {
        return [`+++++ ${getLastNUriRelativePathParts(workspaceUris, filepath, 2)}\n${prefix}`, suffix]
      }
      return [prefix, suffix]
    }

    const relativePaths = getShortestUniqueRelativeUriPaths(
      [...snippets.map((snippet) => ("filepath" in snippet ? snippet.filepath : "file:///Untitled.txt")), filepath],
      workspaceUris,
    )

    const otherFiles = snippets
      .map((snippet, i) => `+++++ ${getFileName(relativePaths[i])} \n${snippet.content}`)
      .join("\n\n")

    return [`${otherFiles}\n\n+++++ ${getFileName(relativePaths[relativePaths.length - 1])}\n${prefix}`, suffix]
  },
  template: (prefix: string, suffix: string): string => {
    return `[SUFFIX]${suffix}[PREFIX]${prefix}`
  },
  completionOptions: {
    stop: ["[PREFIX]", "[SUFFIX]", "\n+++++ "],
  },
} satisfies AutocompleteTemplate

export const starcoderTemplate = {
  template: (prefix: string, suffix: string): string => {
    return `<fim_prefix>${prefix}<fim_suffix>${suffix}<fim_middle>`
  },
  completionOptions: {
    stop: ["<fim_prefix>", "<fim_suffix>", "<fim_middle>", "<|endoftext|>", "<file_sep>"],
  },
  endpoint: "completions",
} satisfies AutocompleteTemplate

export const qwenTemplate = {
  template: (prefix: string, suffix: string): string => {
    return `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`
  },
  completionOptions: {
    stop: ["<|fim_prefix|>", "<|fim_suffix|>", "<|fim_middle|>", "<|endoftext|>", "<file_sep>"],
  },
  endpoint: "generate",
} satisfies AutocompleteTemplate

export const codeLlamaTemplate = {
  template: (prefix: string, suffix: string): string => {
    return `<PRE> ${prefix} <SUF> ${suffix} <MID>`
  },
  completionOptions: {
    stop: ["<PRE>", "<SUF>", "<MID>", "<EOT>"],
  },
  endpoint: "generate",
} satisfies AutocompleteTemplate

export const fimTemplates = {
  starcoder: starcoderTemplate,
  qwen: qwenTemplate,
  codellama: codeLlamaTemplate,
}

export type FimTemplateID = keyof typeof fimTemplates

export function inferFimTemplate(model: string): FimTemplateID {
  const name = model.toLowerCase()
  if (name.includes("starcoder")) return "starcoder"
  if (name.includes("llama")) return "codellama"
  return "qwen"
}
