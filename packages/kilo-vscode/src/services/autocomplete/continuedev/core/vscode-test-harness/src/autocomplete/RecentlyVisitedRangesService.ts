import { IDE } from "../../../"
import { AutocompleteCodeSnippet, AutocompleteSnippetType } from "../../../autocomplete/types"
import { isSecurityConcern } from "../../../indexing/ignore"
import { LRUCache } from "lru-cache"
import * as vscode from "vscode"

const DELAY = 250

/**
 * Service to keep track of recently visited ranges in files.
 */
export class RecentlyVisitedRangesService {
  private cache: LRUCache<string, Array<AutocompleteCodeSnippet & { timestamp: number }>>
  private numSurroundingLines = 20
  private maxRecentFiles = 3
  private maxSnippetsPerFile = 3
  private disposable: vscode.Disposable | undefined
  private timer: NodeJS.Timeout | undefined
  private pending: vscode.TextEditorSelectionChangeEvent | undefined
  private enabled = false

  constructor(private readonly ide: IDE) {
    this.cache = new LRUCache<string, Array<AutocompleteCodeSnippet & { timestamp: number }>>({
      max: this.maxRecentFiles,
    })
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return
    this.enabled = enabled
    if (!enabled) {
      this.disposable?.dispose()
      this.disposable = undefined
      if (this.timer) clearTimeout(this.timer)
      this.timer = undefined
      this.pending = undefined
      return
    }
    this.disposable = vscode.window.onDidChangeTextEditorSelection((event) => {
      this.pending = event
      if (this.timer) return
      this.timer = setTimeout(() => {
        this.timer = undefined
        const next = this.pending
        this.pending = undefined
        if (next) void this.capture(next)
      }, DELAY)
    })
  }

  private async capture(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
    const fsPath = event.textEditor.document.fileName
    if (isSecurityConcern(fsPath)) {
      return
    }
    const filepath = event.textEditor.document.uri.toString()
    const line = event.selections.at(0)?.active.line
    if (line === undefined) return
    const startLine = Math.max(0, line - this.numSurroundingLines)
    const endLine = Math.min(line + this.numSurroundingLines, event.textEditor.document.lineCount - 1)

    try {
      const content = await this.ide.readRangeInFile(filepath, {
        start: { line: startLine, character: 0 },
        end: { line: endLine, character: Number.MAX_SAFE_INTEGER },
      })
      const relevantLines = content.trim()

      const snippet: AutocompleteCodeSnippet & { timestamp: number } = {
        filepath,
        content: relevantLines,
        type: AutocompleteSnippetType.Code,
        timestamp: Date.now(),
      }

      const existing = this.cache.get(filepath) || []
      const newSnippets = [...existing, snippet]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, this.maxSnippetsPerFile)

      this.cache.set(filepath, newSnippets)
    } catch (err) {
      console.error("Error caching recently visited ranges for autocomplete: ", err)
      return
    }
  }

  /**
   * Returns up to {@link maxSnippetsPerFile} snippets from the {@link maxRecentFiles} most recently visited files.
   * Excludes snippets from the currently active file.
   * @returns Array of code snippets from recently visited files
   */
  public getSnippets(): AutocompleteCodeSnippet[] {
    const currentFilepath = vscode.window.activeTextEditor?.document.uri.toString()
    let allSnippets: Array<AutocompleteCodeSnippet & { timestamp: number }> = []

    // Get most recent snippets from each file in cache
    for (const filepath of Array.from(this.cache.keys())) {
      const snippets = (this.cache.get(filepath) || [])
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, this.maxSnippetsPerFile)
      allSnippets = [...allSnippets, ...snippets]
    }

    return allSnippets
      .filter(
        (s) =>
          !currentFilepath ||
          (s.filepath !== currentFilepath &&
            // Exclude Continue's own output as it makes it super-hard for users to test the autocomplete feature
            // while looking at the prompts in the Continue's output
            !s.filepath.startsWith("output:extension-output-Continue.continue")),
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(({ timestamp: _timestamp, ...snippet }) => snippet)
  }

  public dispose(): void {
    this.setEnabled(false)
    this.cache.clear()
  }
}
