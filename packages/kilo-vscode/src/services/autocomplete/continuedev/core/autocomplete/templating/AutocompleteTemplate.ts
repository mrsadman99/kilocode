// Fill in the middle prompts.
//
// Codestral is native-only FIM (the server receives `prompt` and `suffix`
// separately), so it has no client-side template. This module keeps the
// prefix/suffix compiler used by the classic autocomplete path to fold in
// cross-file snippets, and re-exports the shared FIM profile registry used by
// the local/custom transports to encode the hole for other model families.

import { getLastNUriRelativePathParts, getShortestUniqueRelativeUriPaths } from "../../util/uri.js"
import { AutocompleteSnippet } from "../types.js"

export {
  FIM_TEMPLATE_IDS,
  matchFimProfile,
  profiles,
  renderFim,
  resolveFimProfile,
  validFimTemplate,
} from "@kilocode/kilo-gateway/autocomplete"
export type { FimProfile, FimTemplateID, LocalFimEndpoint, RenderedFim } from "@kilocode/kilo-gateway/autocomplete"

export const codestralTemplate = {
  compilePrefixSuffix: (
    prefix: string,
    suffix: string,
    filepath: string,
    _reponame: string,
    snippets: AutocompleteSnippet[],
    workspaceUris: string[],
  ): [string, string] => {
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
}
