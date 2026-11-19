import * as vscode from "vscode"
import { ContextRetrievalService } from "../continuedev/core/autocomplete/context/ContextRetrievalService"
import { VsCodeIde } from "../continuedev/core/vscode-test-harness/src/VSCodeIde"
import { AutocompleteInput } from "../types"
import { HelperVars } from "../continuedev/core/autocomplete/util/HelperVars"
import { getAllSnippetsWithoutRace } from "../continuedev/core/autocomplete/snippets/getAllSnippets"
import { DEFAULT_AUTOCOMPLETE_OPTS } from "../continuedev/core/util/parameters"
import { getSnippets } from "../continuedev/core/autocomplete/templating/filtering"
import { FileIgnoreController } from "../shims/FileIgnoreController"
import { AutocompleteSnippet, AutocompleteSnippetType } from "../continuedev/core/autocomplete/types"

function uriToFsPath(filepath: string): string {
  if (filepath.startsWith("file://")) {
    return vscode.Uri.parse(filepath).fsPath
  }
  return filepath
}

function hasFilepath(snippet: AutocompleteSnippet): snippet is AutocompleteSnippet & { filepath?: string } {
  return snippet.type === AutocompleteSnippetType.Code || snippet.type === AutocompleteSnippetType.Static
}

async function filterSnippetsByAccess(
  snippets: AutocompleteSnippet[],
  ignoreFor?: (uri: vscode.Uri) => Promise<FileIgnoreController> | undefined,
): Promise<AutocompleteSnippet[]> {
  if (!ignoreFor) {
    return snippets
  }

  try {
    // Resolve each snippet against the ignore rules of its own workspace root.
    const checks = await Promise.all(
      snippets.map(async (snippet) => {
        const filepath = hasFilepath(snippet) ? snippet.filepath : undefined
        // Keep snippet types (Diff, Clipboard) that don't have file paths.
        if (!filepath) return true
        const uri = filepath.startsWith("file://") ? vscode.Uri.parse(filepath) : vscode.Uri.file(filepath)
        const controller = await Promise.race([
          ignoreFor(uri) ?? Promise.resolve(null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
        ])
        // Unresolved controller or outside-workspace file: deny by default.
        if (!controller) return false
        return controller.validateAccess(uriToFsPath(filepath))
      }),
    )
    return snippets.filter((_, i) => checks[i])
  } catch (error) {
    console.error("[AutocompleteContextProvider] Error filtering snippets by access:", error)
    // On error, be conservative and filter out file-based snippets
    return snippets.filter((snippet) => !hasFilepath(snippet) || !snippet.filepath)
  }
}

export async function getProcessedSnippets(
  autocompleteInput: AutocompleteInput,
  filepath: string,
  contextService: ContextRetrievalService,
  modelId: string,
  ide: VsCodeIde,
  ignoreFor?: (uri: vscode.Uri) => Promise<FileIgnoreController> | undefined,
): Promise<{
  filepathUri: string
  helper: any
  snippetsWithUris: AutocompleteSnippet[]
  workspaceDirs: string[]
}> {
  // Convert filepath to URI if it's not already one
  const filepathUri = filepath.startsWith("file://") ? filepath : vscode.Uri.file(filepath).toString()

  // Warm the import-definitions cache in the background: a cold tree-sitter/LSP parse
  // must not block the FIM request. Import snippets join once the cache is ready.
  void contextService.initializeForFile(filepathUri)

  // Create helper with URI filepath
  const helperInput = {
    ...autocompleteInput,
    filepath: filepathUri,
  }

  const modelName = modelId || "codestral"
  const helper = await HelperVars.create(helperInput as any, DEFAULT_AUTOCOMPLETE_OPTS, modelName, ide)

  const snippetPayload = await getAllSnippetsWithoutRace({
    helper,
    ide,
    contextRetrievalService: contextService,
  })

  const filteredSnippets = getSnippets(helper, snippetPayload)

  // Apply access filtering to remove snippets from blocked files
  const accessibleSnippets = await filterSnippetsByAccess(filteredSnippets, ignoreFor)

  // Convert all snippet filepaths to URIs
  const snippetsWithUris = accessibleSnippets.map((snippet: any) => ({
    ...snippet,
    filepath: snippet.filepath?.startsWith("file://") ? snippet.filepath : vscode.Uri.file(snippet.filepath).toString(),
  }))

  const workspaceDirs = await ide.getWorkspaceDirs()

  return { filepathUri, helper, snippetsWithUris, workspaceDirs }
}
