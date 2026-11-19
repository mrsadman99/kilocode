import * as vscode from "vscode"
import {
  validAutocompleteModel,
  validAutocompleteProvider,
  validFimTemplate,
  validLocalFimEndpoint,
} from "../../shared/autocomplete-models"

type Message = {
  type: string
}

type Post = (msg: unknown) => void

export async function routeAutocompleteMessage(message: Message, post: Post): Promise<boolean> {
  if (message.type === "requestAutocompleteSettings") {
    post(buildAutocompleteSettingsMessage())
    return true
  }

  return false
}

export function buildAutocompleteSettingsMessage() {
  const config = vscode.workspace.getConfiguration("kilo-code.new.autocomplete")
  // Pass through provider/model as-is (null when unset) so the webview can
  // distinguish "user hasn't picked" from "user picked the current default."
  // The runtime resolves null → DEFAULT_AUTOCOMPLETE_MODEL via getAutocompleteModel().
  return {
    type: "autocompleteSettingsLoaded" as const,
    settings: {
      enableAutoTrigger: config.get<boolean>("enableAutoTrigger", true),
      enableSmartInlineTaskKeybinding: config.get<boolean>("enableSmartInlineTaskKeybinding", false),
      enableChatAutocomplete: config.get<boolean>("enableChatAutocomplete", false),
      provider: config.get<string>("provider") ?? null,
      model: config.get<string>("model") ?? null,
      localModel: config.get<string>("localModel") ?? null,
      localBaseURL: config.get<string>("localBaseURL") ?? null,
      localProxy: config.get<string>("localProxy") ?? null,
      localTemplate: config.get<string>("localTemplate") ?? null,
      localEndpoint: config.get<string>("localEndpoint") ?? null,
    },
  }
}

/** Push autocomplete settings to the webview whenever VS Code config changes. */
export function watchAutocompleteConfig(post: Post): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("kilo-code.new.autocomplete")) {
      post(buildAutocompleteSettingsMessage())
    }
  })
}

function validLocalSetting(key: string, value: unknown) {
  if (value === null || value === undefined) return true
  if (key === "localModel" || key === "localBaseURL" || key === "localProxy") return typeof value === "string"
  if (key === "localTemplate") return value === "auto" || validFimTemplate(value)
  if (key === "localEndpoint") return value === "auto" || validLocalFimEndpoint(value)
  return false
}

export function validAutocompleteSetting(key: string, value: unknown) {
  if (key === "model") {
    // Allow clearing back to the server-side default.
    if (value === null || value === undefined) return true
    return validAutocompleteModel(value)
  }

  if (key === "provider") {
    if (value === null || value === undefined) return true
    return validAutocompleteProvider(value)
  }

  if (key === "enableAutoTrigger") return typeof value === "boolean"
  if (key === "enableSmartInlineTaskKeybinding") return typeof value === "boolean"
  if (key === "enableChatAutocomplete") return typeof value === "boolean"

  if (key.startsWith("local")) return validLocalSetting(key, value)

  return false
}
