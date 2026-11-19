export const dict = {
  "kilocode:autocomplete.statusBar.enabled": "$(kilo-logo) 自動完成",
  "kilocode:autocomplete.statusBar.snoozed": "已暫停",
  "kilocode:autocomplete.statusBar.warning": "$(warning) 自動完成",
  "kilocode:autocomplete.statusBar.tooltip.basic": "Kilo Code 自動完成",
  "kilocode:autocomplete.statusBar.tooltip.noUsableProvider":
    "**尚未設定自動完成模型**\n\n若要啟用自動完成，請新增包含下列其中一個支援提供者的設定檔：{{providers}}。\n\n[開啟設定]({{command}})",
  "kilocode:autocomplete.statusBar.tooltip.completionSummary":
    "在 {{startTime}} 到 {{endTime}} 之間執行了 {{count}} 次完成，總成本為 {{cost}}。",
  "kilocode:autocomplete.statusBar.tooltip.providerInfo": "自動完成由 {{provider}} 透過 {{model}} 提供。",
  "kilocode:autocomplete.statusBar.cost.zero": "$0.00",
  "kilocode:autocomplete.statusBar.cost.lessThanCent": "<$0.01",
  "kilocode:autocomplete.codeAction.title": "Kilo Code：建議的編輯",
  "kilocode:autocomplete.incompatibilityExtensionPopup.message":
    "Kilo Code 自動完成因與 GitHub Copilot 衝突而被封鎖。若要修正此問題，必須停用 Copilot 的內嵌建議。",
  "kilocode:autocomplete.incompatibilityExtensionPopup.disableCopilot": "停用 Copilot",
  "kilocode:autocomplete.incompatibilityExtensionPopup.disableInlineAssist": "停用自動完成",
  "kilocode:autocomplete.creditsExhausted.message":
    "Kilo Code 自動完成已暫停。可能原因：你的 Kilo 帳戶沒有剩餘額度，或你設定的 API 金鑰（BYOK）已達到配額限制。請新增 Kilo 額度或檢查 API 金鑰設定以恢復自動完成。",
  "kilocode:autocomplete.creditsExhausted.addCredits": "新增額度",
  "kilocode:autocomplete.authError.message":
    "Kilo Code 自動完成因驗證問題已暫停。可能原因：你尚未登入 Kilo，或你的 API 金鑰（BYOK）無效或遺失。請重新登入或檢查提供者 API 金鑰設定。",
  "kilocode:autocomplete.invalidProvider.message":
    "Kilo Code 自動完成已暫停：設定的供應商「{{provider}}」不受支援。開啟設定 → 模型，選擇 Kilo Gateway、Mistral 或 Local (Ollama)。",
  "kilocode:autocomplete.notFound.message":
    "Kilo Code 自動完成已暫停：找不到自動完成模型或 API 端點（404）。請在設定 → 模型中檢查模型名稱和端點。對於本機模型，請確保模型已安裝且伺服器 URL 正確。",
}
