import * as vscode from "vscode"
import { buildRuns } from "./prompt-timeline/runs"
import { buildWebviewHtml } from "./utils"
import type { KiloConnectionService } from "./services/cli-backend"

export interface PromptTimelineOptions {
  /** Resolve the directory a session runs in (worktree-aware). */
  resolveDirectory?: (sessionID: string) => string | undefined
}

interface SessionItem {
  id: string
  title?: string
  updatedAt?: string
}

/**
 * Read-only editor panel that visualizes prompt execution stages.
 *
 * One panel is shared across sessions: opening it again reveals the same
 * tab and switches the displayed session. Follows the DocumentViewerProvider
 * panel lifecycle (pending open until webviewReady, dispose on close).
 */
export class PromptTimelineProvider implements vscode.Disposable {
  public static readonly viewType = "kilo-code.new.PromptTimelinePanel"
  private panel: vscode.WebviewPanel | undefined
  private pending: { sessionID: string; directory?: string } | undefined
  private current: { sessionID: string; directory?: string } | undefined
  private readonly disposables: vscode.Disposable[] = []

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly connection: KiloConnectionService,
    private readonly options: PromptTimelineOptions = {},
  ) {}

  open(sessionID: string, directory?: string): void {
    const dir =
      directory ?? this.options.resolveDirectory?.(sessionID) ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    this.current = { sessionID, directory: dir }
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn ?? vscode.ViewColumn.One)
      void this.panel.webview.postMessage({ type: "promptTimeline.init", sessionID, directory: dir })
      this.load(sessionID, dir)
      this.loadSessions(dir)
      return
    }
    this.pending = { sessionID, directory: dir }
    this.createPanel()
  }

  dispose(): void {
    this.panel?.dispose()
    for (const item of this.disposables) item.dispose()
    this.disposables.length = 0
  }

  private createPanel(): void {
    const panel = vscode.window.createWebviewPanel(
      PromptTimelineProvider.viewType,
      "Prompt Timeline",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      },
    )
    panel.iconPath = {
      light: vscode.Uri.joinPath(this.extensionUri, "assets", "icons", "kilo-light.svg"),
      dark: vscode.Uri.joinPath(this.extensionUri, "assets", "icons", "kilo-dark.svg"),
    }
    panel.webview.html = this.html(panel.webview)
    this.panel = panel
    this.disposables.push(
      panel.webview.onDidReceiveMessage((message) => this.message(message as Record<string, unknown>)),
      panel.onDidDispose(() => {
        this.panel = undefined
        this.pending = undefined
        this.current = undefined
      }),
    )
  }

  private message(message: Record<string, unknown>): void {
    if (message.type === "webviewReady") return this.ready()
    if (message.type === "promptTimeline.selectSession" && typeof message.sessionID === "string") {
      if (!this.current) return
      this.current = { sessionID: message.sessionID, directory: this.current.directory }
      this.load(message.sessionID, this.current.directory)
      return
    }
    if (message.type === "promptTimeline.refresh") {
      if (!this.current) return
      this.load(this.current.sessionID, this.current.directory)
      this.loadSessions(this.current.directory)
      return
    }
    if (message.type === "promptTimeline.close") this.panel?.dispose()
  }

  private ready(): void {
    const input = this.pending ?? this.current
    if (!input || !this.panel) return
    this.pending = undefined
    this.current = input
    void this.panel.webview.postMessage({
      type: "promptTimeline.init",
      sessionID: input.sessionID,
      directory: input.directory,
    })
    this.load(input.sessionID, input.directory)
    this.loadSessions(input.directory)
  }

  private load(sessionID: string, directory?: string): void {
    const panel = this.panel
    if (!panel) return
    void panel.webview.postMessage({ type: "promptTimeline.loading", sessionID, loading: true })
    void this.connection
      .getClientAsync(directory)
      .then((client) => client.session.messages({ sessionID, directory, limit: 0 }, { throwOnError: true }))
      .then(({ data }) => {
        if (this.current?.sessionID !== sessionID) return
        void panel.webview.postMessage({ type: "promptTimeline.runs", sessionID, runs: buildRuns(data) })
      })
      .catch((err: unknown) => {
        console.error("[Kilo New] PromptTimelineProvider: Failed to load messages:", err)
        if (this.current?.sessionID !== sessionID) return
        void panel.webview.postMessage({
          type: "promptTimeline.error",
          sessionID,
          message: err instanceof Error ? err.message : String(err),
        })
      })
  }

  private loadSessions(directory?: string): void {
    const panel = this.panel
    if (!panel) return
    void this.connection
      .getClientAsync(directory)
      .then((client) => client.session.list({ directory, roots: true }, { throwOnError: true }))
      .then(({ data }) => {
        const sessions: SessionItem[] = data.map((item) => ({
          id: item.id,
          title: item.title,
          updatedAt: item.time?.updated ? new Date(item.time.updated).toISOString() : undefined,
        }))
        void panel.webview.postMessage({ type: "promptTimeline.sessions", sessions })
      })
      .catch((err: unknown) => {
        console.error("[Kilo New] PromptTimelineProvider: Failed to list sessions:", err)
      })
  }

  private html(webview: vscode.Webview): string {
    return buildWebviewHtml(webview, {
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "prompt-timeline.js")),
      styleUri: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "prompt-timeline.css")),
      iconsBaseUri: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "assets", "icons")),
      workerUri: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "shiki-worker.js")),
      title: "Prompt Timeline",
      port: this.connection.getServerInfo()?.port,
    })
  }
}
