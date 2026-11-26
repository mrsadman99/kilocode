import * as vscode from "vscode"

/**
 * Handle the openPromptTimeline webview message on a dedicated listener.
 * Registered before the main KiloProvider message handler (which sits at its
 * complexity budget) and chained into the provider's message disposable.
 */
export function watchPromptTimeline(webview: vscode.Webview, open: (sessionID?: string) => void) {
  return webview.onDidReceiveMessage((message: { type?: string; sessionID?: string }) => {
    if (message?.type === "openPromptTimeline") open(message.sessionID)
  })
}
