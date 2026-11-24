import * as vscode from "vscode"

const FLAG = "kilo.autocomplete.localToCustomMigrationV1"

/**
 * One-time migration: fold the legacy `local` autocomplete provider into the
 * unified `custom` provider. The local server protocols (Ollama generate,
 * OpenAI-compatible completions with client-side FIM templates) are now custom
 * formats, so `provider=local` configs are rewritten to `provider=custom` with
 * the matching `customFormat`/`customTemplate` and the local* values copied
 * into custom*. The legacy `local` provider id keeps resolving at runtime for
 * configs this migration does not reach (e.g. workspace-folder pins).
 *
 * Runs once per machine, gated on a globalState flag, before the service
 * manager's first readSettings(). Provider is written last so no intermediate
 * config state is invalid.
 */
export async function migrateLocalAutocompleteProvider(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<boolean>(FLAG)) return

  const config = vscode.workspace.getConfiguration("kilo-code.new.autocomplete")
  const inspect = config.inspect<string>("provider")
  const scopes: [vscode.ConfigurationTarget, string | undefined][] = [
    [vscode.ConfigurationTarget.Global, inspect?.globalValue],
    [vscode.ConfigurationTarget.Workspace, inspect?.workspaceValue],
  ]

  for (const [target, provider] of scopes) {
    if (provider !== "local") continue
    const endpoint = config.get<string>("localEndpoint")
    await config.update("customModel", config.get<string>("localModel") ?? undefined, target)
    await config.update("customBaseURL", config.get<string>("localBaseURL") ?? undefined, target)
    await config.update("customProxy", config.get<string>("localProxy") ?? undefined, target)
    await config.update("customTemplate", config.get<string>("localTemplate") ?? "auto", target)
    await config.update("customFormat", endpoint === "completions" ? "completions" : "generate", target)
    await config.update("model", undefined, target)
    await config.update("provider", "custom", target)
  }

  await context.globalState.update(FLAG, true)
}
